/* Sigorta Portföy - browser persistence: IndexedDB, falling back to localStorage, then memory. */
(function (root) {
  'use strict';
  var DB_NAME = 'sigorta-portfoy';
  var DB_VERSION = 3; // 2: cancellations (İptal rows); 3: files (the linked Excel file)
  var STORES = ['customers', 'policies', 'tasks', 'activities', 'cancellations', 'meta'];
  // kept apart from the data: a file handle and workbook bytes, stored as they are (no JSON copy)
  var FILES = 'files';
  var KEY = { meta: 'key', files: 'key' };

  function keyOf(store) { return KEY[store] || 'id'; }

  // ------------------------------------------------------------------ IndexedDB backend
  function IDBBackend(db) { this.db = db; this.kind = 'indexeddb'; }

  function req(r) {
    return new Promise(function (resolve, reject) {
      r.onsuccess = function () { resolve(r.result); };
      r.onerror = function () { reject(r.error); };
    });
  }

  function txDone(tx) {
    return new Promise(function (resolve, reject) {
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function () { reject(tx.error); };
      tx.onabort = function () { reject(tx.error || new Error('Transaction aborted')); };
    });
  }

  IDBBackend.prototype.getAll = function (store) {
    return req(this.db.transaction(store, 'readonly').objectStore(store).getAll());
  };
  IDBBackend.prototype.put = function (store, items) {
    var tx = this.db.transaction(store, 'readwrite');
    var os = tx.objectStore(store);
    items.forEach(function (it) { os.put(it); });
    return txDone(tx);
  };
  IDBBackend.prototype.get = function (store, key) {
    return req(this.db.transaction(store, 'readonly').objectStore(store).get(key));
  };
  IDBBackend.prototype.keys = function (store) {
    return req(this.db.transaction(store, 'readonly').objectStore(store).getAllKeys());
  };
  IDBBackend.prototype.del = function (store, ids) {
    var tx = this.db.transaction(store, 'readwrite');
    var os = tx.objectStore(store);
    ids.forEach(function (id) { os.delete(id); });
    return txDone(tx);
  };
  IDBBackend.prototype.clear = function (store) {
    var tx = this.db.transaction(store, 'readwrite');
    tx.objectStore(store).clear();
    return txDone(tx);
  };

  function openIDB() {
    return new Promise(function (resolve, reject) {
      if (!root.indexedDB) { reject(new Error('IndexedDB unavailable')); return; }
      var r;
      try { r = root.indexedDB.open(DB_NAME, DB_VERSION); } catch (e) { reject(e); return; }
      r.onupgradeneeded = function () {
        var db = r.result;
        STORES.concat([FILES]).forEach(function (s) {
          if (!db.objectStoreNames.contains(s)) {
            var os = db.createObjectStore(s, { keyPath: keyOf(s) });
            if (s === 'policies') { os.createIndex('customerId', 'customerId'); os.createIndex('month', 'month'); }
            if (s === 'cancellations') os.createIndex('month', 'month');
          }
        });
      };
      r.onsuccess = function () { resolve(r.result); };
      r.onerror = function () { reject(r.error); };
      r.onblocked = function () { reject(new Error('IndexedDB blocked')); };
    });
  }

  // ------------------------------------------------------------------ localStorage / memory backend
  function MapBackend(storage) {
    this.storage = storage;
    this.kind = storage ? 'localstorage' : 'memory';
    this.data = {};
    var self = this;
    STORES.forEach(function (s) {
      var m = new Map();
      if (storage) {
        try {
          var raw = storage.getItem('sp:' + s);
          if (raw) JSON.parse(raw).forEach(function (it) { m.set(it[keyOf(s)], it); });
        } catch (e) { /* unreadable: start empty */ }
      }
      self.data[s] = m;
    });
    this.data[FILES] = new Map(); // handles and bytes cannot go to localStorage: this session only
  }
  MapBackend.prototype.flush = function (store) {
    if (!this.storage || store === FILES) return Promise.resolve();
    try {
      this.storage.setItem('sp:' + store, JSON.stringify(Array.from(this.data[store].values())));
      return Promise.resolve();
    } catch (e) {
      return Promise.reject(e);
    }
  };
  MapBackend.prototype.getAll = function (store) { return Promise.resolve(Array.from(this.data[store].values())); };
  MapBackend.prototype.get = function (store, key) { return Promise.resolve(this.data[store].get(key)); };
  MapBackend.prototype.keys = function (store) { return Promise.resolve(Array.from(this.data[store].keys())); };
  MapBackend.prototype.putRaw = function (store, items) {
    var m = this.data[store], k = keyOf(store);
    items.forEach(function (it) { m.set(it[k], it); });
    return this.flush(store);
  };
  MapBackend.prototype.put = function (store, items) {
    var m = this.data[store], k = keyOf(store);
    items.forEach(function (it) { m.set(it[k], JSON.parse(JSON.stringify(it))); });
    return this.flush(store);
  };
  MapBackend.prototype.del = function (store, ids) {
    var m = this.data[store];
    ids.forEach(function (id) { m.delete(id); });
    return this.flush(store);
  };
  MapBackend.prototype.clear = function (store) { this.data[store].clear(); return this.flush(store); };

  // ------------------------------------------------------------------ facade with a serial write queue
  var backend = null;
  var queue = Promise.resolve();

  function enqueue(fn) {
    var p = queue.then(fn);
    queue = p.catch(function () { /* keep the queue alive */ });
    return p;
  }

  function localStorageUsable() {
    try {
      var k = 'sp:probe';
      root.localStorage.setItem(k, '1');
      root.localStorage.removeItem(k);
      return true;
    } catch (e) { return false; }
  }

  var DB = {
    STORES: STORES,
    get kind() { return backend ? backend.kind : 'none'; },
    init: function (opts) {
      opts = opts || {};
      if (backend) return Promise.resolve(backend.kind);
      var tryIdb = opts.force === 'localstorage' || opts.force === 'memory' ? Promise.reject(new Error('skip')) : openIDB();
      return tryIdb.then(function (db) {
        backend = new IDBBackend(db);
        return backend.kind;
      }, function () {
        backend = new MapBackend(opts.force !== 'memory' && localStorageUsable() ? root.localStorage : null);
        return backend.kind;
      });
    },
    getAll: function (store) { return backend.getAll(store); },
    put: function (store, items) {
      items = Array.isArray(items) ? items : [items];
      if (!items.length) return Promise.resolve();
      // structured clone happens inside IndexedDB; snapshot now so later edits do not race
      var copy = items.map(function (x) { return JSON.parse(JSON.stringify(x)); });
      return enqueue(function () { return backend.put(store, copy); });
    },
    del: function (store, ids) {
      ids = Array.isArray(ids) ? ids : [ids];
      if (!ids.length) return Promise.resolve();
      return enqueue(function () { return backend.del(store, ids); });
    },
    clear: function (store) { return enqueue(function () { return backend.clear(store); }); },
    /** Stores items as they are: file handles and ArrayBuffers survive, nothing is JSON-copied. */
    putRaw: function (store, items) {
      items = Array.isArray(items) ? items : [items];
      return enqueue(function () { return backend.putRaw ? backend.putRaw(store, items) : backend.put(store, items); });
    },
    get: function (store, key) { return enqueue(function () { return backend.get(store, key); }); },
    keys: function (store) { return enqueue(function () { return backend.keys(store); }); },
    FILES: FILES,
    idle: function () { return queue; }
  };

  root.DB = DB;
})(typeof self !== 'undefined' ? self : this);
