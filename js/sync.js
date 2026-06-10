// Debug counters gated behind ?debug=1
const isDebug = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === '1';
window.DCCS_DEBUG = window.DCCS_DEBUG || {
  routeCalls: 0,
  firestoreWrites: 0,
  snapshotFires: 0
};
if (isDebug) {
  if (!window.DCCS_DEBUG._intervalStarted) {
    window.DCCS_DEBUG._intervalStarted = true;
    setInterval(() => {
      console.log(`[DCCS Debug] Route calls: ${window.DCCS_DEBUG.routeCalls} | Writes: ${window.DCCS_DEBUG.firestoreWrites} | Snapshots: ${window.DCCS_DEBUG.snapshotFires}`);
    }, 30000);
  }
}

const Sync = {
  db: null,
  enabled: false,
  unsubscribe: null,
  _metricsUnsubscribe: null,
  _dialogueUnsubscribe: null,
  _dialogueDocs: {},
  pendingWrites: new Set(),
  cache: {
    tasks: {},
    metrics: {},
    hedis: {},
    dialogue: {},
    er_data: {}
  },

  setStatus(newStatus) {
    this.status = newStatus;
    const badge = document.getElementById('sync-status');
    if (!badge) return;
    
    if (this.idleTimeoutId) {
      clearTimeout(this.idleTimeoutId);
      this.idleTimeoutId = null;
    }
    
    badge.className = 'sync-status-badge ' + newStatus;
    const textNode = badge.querySelector('.sync-text');
    if (textNode) {
      if (newStatus === 'syncing') textNode.textContent = 'Syncing...';
      else if (newStatus === 'synced') textNode.textContent = 'Synced';
      else textNode.textContent = 'Offline';
    }

    if (newStatus === 'synced') {
      this.idleTimeoutId = setTimeout(() => {
        if (this.status === 'synced') {
          badge.classList.add('synced-idle');
        }
      }, 2000);
    }
  },

  init() {
    try {
      // 1. ALWAYS load local storage backup first so the app has data instantly
      this.loadLocalBackup();

      const firebaseConfig = {
        projectId: "glwch-dccs-2027",
        appId: "1:1022797767837:web:5d3bb4d314efe49c216074",
        storageBucket: "glwch-dccs-2027.firebasestorage.app",
        apiKey: "AIzaSyAmhmP4ZKYASr37vAFC0ziSyXvicb6Dg78",
        authDomain: "glwch-dccs-2027.firebaseapp.com",
        messagingSenderId: "1022797767837"
      };

      // Initialize Firebase App
      firebase.initializeApp(firebaseConfig);
      this.db = firebase.firestore();
      
      // Enable Firestore offline persistence if available (multi-tab sync enabled)
      this.db.enablePersistence({ synchronizeTabs: true }).catch((err) => {
        console.warn("Firestore persistence failed to enable:", err.code);
      });

      this.enabled = true;
      this.setStatus('synced');

      // Listen to window online/offline events
      window.addEventListener('online', () => {
        if (this.enabled) this.setStatus('synced');
      });
      window.addEventListener('offline', () => {
        this.setStatus('offline');
      });
      
      // Run V2 migration, then subscribe
      this.runMigrationV2().then(() => {
        this.subscribe();
      }).catch(err => {
        console.error("DCCS Sync: V2 migration failed, stopping sync initialization:", err);
        this.disableSync();
      });
    } catch (e) {
      console.warn("Firebase failed to initialize. Falling back to local storage.", e);
      this.enabled = false;
      this.setStatus('offline');
    }

    // Synchronize ER metrics from the compiled JSON data file
    this.syncERMetrics();
  },

  loadLocalBackup() {
    try {
      this.cache.tasks = JSON.parse(localStorage.getItem('dccs-task-data') || '{}');
      this.cache.metrics = JSON.parse(localStorage.getItem('dccs-metric-entries') || '{}');
      this.cache.hedis = JSON.parse(localStorage.getItem('dccs-hedis-data') || '{}');
      this.cache.dialogue = JSON.parse(localStorage.getItem('dccs-dialogue-entries') || '{}');
      this.cache.er_data = JSON.parse(localStorage.getItem('dccs-er-data') || '{}');
    } catch (e) {
      console.error("Failed to load local backup data:", e);
    }
  },

  disableSync() {
    this.enabled = false;
    if (this.unsubscribe) {
      try { this.unsubscribe(); } catch (_) {}
      this.unsubscribe = null;
    }
    if (this._metricsUnsubscribe) {
      try { this._metricsUnsubscribe(); } catch (_) {}
      this._metricsUnsubscribe = null;
    }
    if (this._dialogueUnsubscribe) {
      try { this._dialogueUnsubscribe(); } catch (_) {}
      this._dialogueUnsubscribe = null;
    }
    this.setStatus('offline');
    this.loadLocalBackup();
    
    // Refresh the UI to reflect fallback to offline local storage
    if (window.App && typeof App.route === "function") {
      App.route();
    }
  },

  async uploadDocument(id, data) {
    if (!this.enabled || !this.db) return;
    window.DCCS_DEBUG.firestoreWrites++;
    try {
      await this.db.collection("dccs_data").doc(id).set(data);
    } catch (e) {
      console.error(`Firestore upload failed for "${id}":`, e);
      this.disableSync();
    }
  },

  subscribe() {
    if (!this.enabled || !this.db) return;

    this.setStatus('syncing');

    if (this.unsubscribe) {
      try { this.unsubscribe(); } catch (_) {}
    }
    if (this._metricsUnsubscribe) {
      try { this._metricsUnsubscribe(); } catch (_) {}
    }
    if (this._dialogueUnsubscribe) {
      try { this._dialogueUnsubscribe(); } catch (_) {}
    }

    // 1. Original listener for tasks, hedis, and er_data
    this.unsubscribe = this.db.collection("dccs_data").onSnapshot((snapshot) => {
      window.DCCS_DEBUG.snapshotFires++;

      snapshot.forEach((doc) => {
        const id = doc.id;
        if (id !== 'tasks' && id !== 'hedis' && id !== 'er_data') {
          return;
        }

        const serverData = doc.data() || {};
        const localData = this.cache[id] || {};

        let docChanged = false;
        let changedKeys = [];

        const allKeys = new Set([...Object.keys(serverData), ...Object.keys(localData)]);
        for (const k of allKeys) {
          if (k === '_lastUpdated') continue;
          
          const itemPath = `${id}/${k}`;
          if (this.pendingWrites.has(itemPath)) {
            continue; // local pending write wins
          }

          if (JSON.stringify(serverData[k]) !== JSON.stringify(localData[k])) {
            if (!this.cache[id]) this.cache[id] = {};
            this.cache[id][k] = serverData[k];
            changedKeys.push(k);
            docChanged = true;
          }
        }

        if (docChanged) {
          this.cache[id]._lastUpdated = serverData._lastUpdated || Date.now();
          
          if (id === 'er_data') {
            this.processERData(serverData);
          }

          const storageKeys = {
            tasks: 'dccs-task-data',
            hedis: 'dccs-hedis-data',
            er_data: 'dccs-er-data'
          };
          if (storageKeys[id]) {
            localStorage.setItem(storageKeys[id], JSON.stringify(this.cache[id]));
          }
          if (window.App && typeof App.applyRemoteChange === "function") {
            App.applyRemoteChange(id, this.cache[id], changedKeys);
          }
        }
      });

      this.setStatus('synced');
    }, (error) => {
      console.warn("Firestore subscription failed/lost, reverting to local backups:", error);
      this.disableSync();
    });

    // 2. Metrics subcollection listener
    this._metricsUnsubscribe = this.db.collection("dccs_data").doc("metrics").collection("series").onSnapshot((snapshot) => {
      window.DCCS_DEBUG.snapshotFires++;
      
      let changedKeys = [];
      snapshot.forEach(doc => {
        const metricId = doc.id;
        const serverDoc = doc.data() || {};
        const serverEntries = serverDoc.entries || [];
        
        const itemPath = `metrics/${metricId}`;
        if (this.pendingWrites.has(itemPath)) {
          return;
        }
        
        const localEntries = this.cache.metrics[metricId] || [];
        if (JSON.stringify(serverEntries) !== JSON.stringify(localEntries)) {
          this.cache.metrics[metricId] = serverEntries;
          changedKeys.push(metricId);
        }
      });
      
      if (changedKeys.length > 0) {
        localStorage.setItem('dccs-metric-entries', JSON.stringify(this.cache.metrics));
        if (window.App && typeof App.applyRemoteChange === "function") {
          App.applyRemoteChange('metrics', this.cache.metrics, changedKeys);
        }
      }
    }, (error) => {
      console.warn("Metrics subcollection snapshot listener failed:", error);
    });

    // 3. Dialogue subcollection listener
    this._dialogueUnsubscribe = this.db.collection("dccs_data").doc("dialogue").collection("entries").onSnapshot((snapshot) => {
      window.DCCS_DEBUG.snapshotFires++;
      
      if (!this._dialogueDocs) {
        this._dialogueDocs = {};
      }
      
      snapshot.docChanges().forEach(change => {
        const doc = change.doc;
        if (change.type === 'removed') {
          delete this._dialogueDocs[doc.id];
        } else {
          this._dialogueDocs[doc.id] = { id: doc.id, ...doc.data() };
        }
      });
      
      const compiled = {};
      Object.values(this._dialogueDocs).forEach(entry => {
        const slId = entry.serviceLineId;
        if (!slId) return;
        if (!compiled[slId]) compiled[slId] = [];
        compiled[slId].push({ date: entry.date, text: entry.text, id: entry.id });
      });
      
      let changedServiceLines = [];
      const slIds = new Set([...Object.keys(compiled), ...Object.keys(this.cache.dialogue)]);
      
      slIds.forEach(slId => {
        const serverEntries = compiled[slId] || [];
        serverEntries.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
        
        const localEntries = this.cache.dialogue[slId] || [];
        
        const serverCompare = serverEntries.map(e => ({ date: e.date, text: e.text }));
        const localCompare = localEntries.map(e => ({ date: e.date, text: e.text }));
        
        if (JSON.stringify(serverCompare) !== JSON.stringify(localCompare)) {
          this.cache.dialogue[slId] = serverEntries;
          changedServiceLines.push(slId);
        }
      });
      
      if (changedServiceLines.length > 0) {
        localStorage.setItem('dccs-dialogue-entries', JSON.stringify(this.cache.dialogue));
        if (window.App && typeof App.applyRemoteChange === "function") {
          App.applyRemoteChange('dialogue', this.cache.dialogue, changedServiceLines);
        }
      }
    }, (error) => {
      console.warn("Dialogue subcollection snapshot listener failed:", error);
    });
  },

  async runMigrationV2() {
    if (!this.enabled || !this.db) return;
    try {
      const metaDoc = await this.db.collection("dccs_data").doc("_meta").get();
      const metaData = metaDoc.exists ? metaDoc.data() : {};
      if (metaData.migratedV2 === true) {
        console.log("DCCS Sync: V2 migration already performed.");
        return;
      }

      console.log("DCCS Sync: Checking for V2 migration...");
      const legacyMetricsDoc = await this.db.collection("dccs_data").doc("metrics").get();
      const legacyDialogueDoc = await this.db.collection("dccs_data").doc("dialogue").get();

      const legacyMetrics = legacyMetricsDoc.exists ? legacyMetricsDoc.data() : {};
      const legacyDialogue = legacyDialogueDoc.exists ? legacyDialogueDoc.data() : {};

      const metricsSnapshot = await this.db.collection("dccs_data").doc("metrics").collection("series").get();
      const dialogueSnapshot = await this.db.collection("dccs_data").doc("dialogue").collection("entries").get();

      const metricsEmpty = metricsSnapshot.empty;
      const dialogueEmpty = dialogueSnapshot.empty;

      if (!metricsEmpty || !dialogueEmpty) {
        console.log("DCCS Sync: V2 subcollections are not empty. Setting migratedV2 flag directly.");
        await this.db.collection("dccs_data").doc("_meta").set({ migratedV2: true }, { merge: true });
        return;
      }

      console.log("DCCS Sync: Starting one-time V2 migration...");

      let expectedMetricsCount = 0;
      let migratedMetricsCount = 0;
      for (const [metricId, entries] of Object.entries(legacyMetrics)) {
        if (metricId === '_lastUpdated') continue;
        if (Array.isArray(entries)) {
          expectedMetricsCount++;
        }
      }

      let expectedDialogueCount = 0;
      let migratedDialogueCount = 0;
      for (const [slId, entries] of Object.entries(legacyDialogue)) {
        if (slId === '_lastUpdated') continue;
        if (Array.isArray(entries)) {
          expectedDialogueCount += entries.length;
        }
      }

      console.log(`DCCS Sync: Migrating ${expectedMetricsCount} metrics series and ${expectedDialogueCount} dialogue entries...`);

      const batch = this.db.batch();
      for (const [metricId, entries] of Object.entries(legacyMetrics)) {
        if (metricId === '_lastUpdated') continue;
        if (Array.isArray(entries)) {
          const docRef = this.db.collection("dccs_data").doc("metrics").collection("series").doc(metricId);
          batch.set(docRef, { entries, _ts: firebase.firestore.FieldValue.serverTimestamp() });
          migratedMetricsCount++;
        }
      }

      for (const [slId, entries] of Object.entries(legacyDialogue)) {
        if (slId === '_lastUpdated') continue;
        if (Array.isArray(entries)) {
          entries.forEach(entry => {
            const docRef = this.db.collection("dccs_data").doc("dialogue").collection("entries").doc();
            batch.set(docRef, {
              serviceLineId: slId,
              date: entry.date || "",
              text: entry.text || "",
              _ts: firebase.firestore.FieldValue.serverTimestamp()
            });
            migratedDialogueCount++;
          });
        }
      }

      if (migratedMetricsCount !== expectedMetricsCount || migratedDialogueCount !== expectedDialogueCount) {
        console.error("DCCS Sync Migration error: Counts mismatch!", {
          expectedMetricsCount, migratedMetricsCount,
          expectedDialogueCount, migratedDialogueCount
        });
        throw new Error("Migration count mismatch! Halting database migration to prevent data loss.");
      }

      await batch.commit();
      console.log("DCCS Sync: Migration batch committed successfully.");

      await this.db.collection("dccs_data").doc("_meta").set({ migratedV2: true }, { merge: true });
      console.log("DCCS Sync: V2 migration completed successfully.");
    } catch (e) {
      console.error("DCCS Sync V2 Migration failed:", e);
      throw e;
    }
  },

  // ===== WRITER INTERFACES =====
  async saveTaskData(taskId, data) {
    const tasks = { ...this.getTaskStore() };
    tasks[taskId] = { ...tasks[taskId], ...data };
    tasks._lastUpdated = Date.now();
    this.cache.tasks = tasks;
    localStorage.setItem('dccs-task-data', JSON.stringify(tasks));

    if (this.enabled && this.db) {
      window.DCCS_DEBUG.firestoreWrites++;
      this.setStatus('syncing');
      try {
        const itemPath = `tasks/${taskId}`;
        this.pendingWrites.add(itemPath);

        await this.db.collection("dccs_data").doc("tasks").set(
          { [taskId]: { ...data, _ts: firebase.firestore.FieldValue.serverTimestamp() } },
          { merge: true }
        );

        this.pendingWrites.delete(itemPath);
        this.setStatus('synced');
      } catch (e) {
        console.error("Firestore failed to write task:", e);
        this.pendingWrites.delete(`tasks/${taskId}`);
        this.disableSync();
      }
    } else {
      this.setStatus('offline');
    }
  },

  async saveMetricStore(allMetrics) {
    // Find which metricId changed
    let changedMetricId = null;
    for (const key of Object.keys(allMetrics)) {
      if (key === '_lastUpdated') continue;
      if (JSON.stringify(allMetrics[key]) !== JSON.stringify(this.cache.metrics[key])) {
        changedMetricId = key;
        break;
      }
    }

    this.cache.metrics = allMetrics;
    localStorage.setItem('dccs-metric-entries', JSON.stringify(allMetrics));

    if (this.enabled && this.db) {
      window.DCCS_DEBUG.firestoreWrites++;
      this.setStatus('syncing');
      try {
        if (changedMetricId) {
          const itemPath = `metrics/${changedMetricId}`;
          this.pendingWrites.add(itemPath);

          const docRef = this.db.collection("dccs_data").doc("metrics").collection("series").doc(changedMetricId);
          await docRef.set({
            entries: allMetrics[changedMetricId],
            _ts: firebase.firestore.FieldValue.serverTimestamp()
          });

          this.pendingWrites.delete(itemPath);
        }
        this.setStatus('synced');
      } catch (e) {
        console.error("Firestore failed to write metrics:", e);
        if (changedMetricId) {
          this.pendingWrites.delete(`metrics/${changedMetricId}`);
        }
        this.disableSync();
      }
    } else {
      this.setStatus('offline');
    }
  },

  async saveHedisData(slId, update) {
    const hedis = { ...this.getHedisStore() };
    const current = hedis[slId] || { kpis: {}, customKpis: [], notes: '' };
    hedis[slId] = { ...current, ...update };
    hedis._lastUpdated = Date.now();
    this.cache.hedis = hedis;
    localStorage.setItem('dccs-hedis-data', JSON.stringify(hedis));

    if (this.enabled && this.db) {
      window.DCCS_DEBUG.firestoreWrites++;
      this.setStatus('syncing');
      try {
        const itemPath = `hedis/${slId}`;
        this.pendingWrites.add(itemPath);

        await this.db.collection("dccs_data").doc("hedis").set(
          { [slId]: { ...update, _ts: firebase.firestore.FieldValue.serverTimestamp() } },
          { merge: true }
        );

        this.pendingWrites.delete(itemPath);
        this.setStatus('synced');
      } catch (e) {
        console.error("Firestore failed to write HEDIS:", e);
        this.pendingWrites.delete(`hedis/${slId}`);
        this.disableSync();
      }
    } else {
      this.setStatus('offline');
    }
  },

  async saveDialogueEntries(slId, entries) {
    this.cache.dialogue[slId] = entries;
    localStorage.setItem('dccs-dialogue-entries', JSON.stringify(this.cache.dialogue));

    if (this.enabled && this.db) {
      window.DCCS_DEBUG.firestoreWrites++;
      this.setStatus('syncing');
      try {
        const collectionRef = this.db.collection("dccs_data").doc("dialogue").collection("entries");
        const existingDocs = Object.values(this._dialogueDocs || {}).filter(d => d.serviceLineId === slId);
        const newIds = new Set(entries.map(e => e.id).filter(Boolean));

        const batch = this.db.batch();

        existingDocs.forEach(doc => {
          if (!newIds.has(doc.id)) {
            batch.delete(collectionRef.doc(doc.id));
          }
        });

        entries.forEach(entry => {
          if (!entry.id) {
            const docRef = collectionRef.doc();
            entry.id = docRef.id; // optimistic local ID assignment
            batch.set(docRef, {
              serviceLineId: slId,
              date: entry.date || "",
              text: entry.text || "",
              _ts: firebase.firestore.FieldValue.serverTimestamp()
            });
          } else {
            const existing = this._dialogueDocs[entry.id];
            if (existing && (existing.text !== entry.text || existing.date !== entry.date)) {
              batch.update(collectionRef.doc(entry.id), {
                date: entry.date,
                text: entry.text,
                _ts: firebase.firestore.FieldValue.serverTimestamp()
              });
            }
          }
        });

        await batch.commit();
        this.setStatus('synced');
      } catch (e) {
        console.error("Firestore failed to write dialogue entries:", e);
        this.disableSync();
      }
    } else {
      this.setStatus('offline');
    }
  },

  async syncERMetrics() {
    let cached = null;
    try {
      cached = JSON.parse(localStorage.getItem('dccs-er-data') || 'null');
    } catch (_) {}

    if (cached && cached.data) {
      console.log("DCCS Sync: Loaded cached ER data from localStorage.");
      this.processERData(cached.data);
    }

    const djb2Hash = (str) => {
      let hash = 5381;
      for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) + hash) + str.charCodeAt(i);
        hash = hash & hash;
      }
      return hash.toString(16);
    };

    const fetchAndCache = async (url) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
      const text = await response.text();
      const hash = djb2Hash(text);
      if (!cached || cached.hash !== hash) {
        console.log(`DCCS Sync: ER data updated from ${url}`);
        const data = JSON.parse(text);
        localStorage.setItem('dccs-er-data', JSON.stringify({ hash, data }));
        this.processERData(data);
      } else {
        console.log(`DCCS Sync: ER data unchanged at ${url}`);
      }
      return true;
    };

    setTimeout(async () => {
      try {
        await fetchAndCache("../ER/data.json");
      } catch (err) {
        try {
          await fetchAndCache("https://matthewdholtkamp.github.io/ER/data.json");
        } catch (err2) {
          console.warn("DCCS Sync: Background ER fetch failed completely.", err2);
        }
      }
    }, 100);
  },

  processERData(data) {
    if (!data || !Array.isArray(data.allData)) return;

    const erTotalCensus = [];
    const erTotalTrainees = [];
    const erEsi12 = [];
    const erEsi3 = [];
    const erEsi45 = [];
    const erLwobs = [];

    data.allData.forEach(row => {
      const date = row.date;
      if (!date) return;

      if (row.census !== undefined && row.census !== null) {
        erTotalCensus.push({ date, value: Number(row.census) });
      }
      if (row.trainees !== undefined && row.trainees !== null) {
        erTotalTrainees.push({ date, value: Number(row.trainees) });
      }
      if (row.cat1 !== undefined && row.cat1 !== null) {
        erEsi12.push({ date, value: Number(row.cat1) });
      }
      if (row.cat23 !== undefined && row.cat23 !== null) {
        erEsi3.push({ date, value: Number(row.cat23) });
      }
      if (row.cat45 !== undefined && row.cat45 !== null) {
        erEsi45.push({ date, value: Number(row.cat45) });
      }
      if (row.lwobs !== undefined && row.lwobs !== null) {
        erLwobs.push({ date, value: Number(row.lwobs) });
      }
    });

    const sortFn = (a, b) => a.date.localeCompare(b.date);
    erTotalCensus.sort(sortFn);
    erTotalTrainees.sort(sortFn);
    erEsi12.sort(sortFn);
    erEsi3.sort(sortFn);
    erEsi45.sort(sortFn);
    erLwobs.sort(sortFn);

    const store = this.cache.metrics || {};
    let hasChanges = false;

    const erPatients = Array.isArray(data.allPatients) ? data.allPatients : [];
    erPatients.sort((a, b) => {
      const dd = (a.date || '').localeCompare(b.date || '');
      if (dd) return dd;
      const ah = a.time ? a.time.hour * 60 + a.time.minute : 0;
      const bh = b.time ? b.time.hour * 60 + b.time.minute : 0;
      return ah - bh;
    });

    const checkAndUpdate = (key, newData) => {
      const current = store[key] || [];
      if (JSON.stringify(current) !== JSON.stringify(newData)) {
        store[key] = newData;
        hasChanges = true;
      }
    };

    checkAndUpdate("er-total-census", erTotalCensus);
    checkAndUpdate("er-total-trainees", erTotalTrainees);
    checkAndUpdate("er-esi-1-2", erEsi12);
    checkAndUpdate("er-esi-3", erEsi3);
    checkAndUpdate("er-esi-4-5", erEsi45);
    checkAndUpdate("er-lwobs", erLwobs);
    checkAndUpdate("er-patients", erPatients);

    if (hasChanges) {
      console.log("DCCS Sync: Updated in-memory ER metrics.");
      localStorage.setItem('dccs-metric-entries', JSON.stringify(store));
    }
  },

  // ===== READER INTERFACES =====
  getTaskStore() {
    return (this.cache.tasks && Object.keys(this.cache.tasks).length > 0) 
      ? this.cache.tasks 
      : JSON.parse(localStorage.getItem('dccs-task-data') || '{}');
  },

  getTaskData(taskId) {
    return this.getTaskStore()[taskId] || {};
  },

  getMetricStore() {
    return (this.cache.metrics && Object.keys(this.cache.metrics).length > 0) 
      ? this.cache.metrics 
      : JSON.parse(localStorage.getItem('dccs-metric-entries') || '{}');
  },

  getHedisStore() {
    return (this.cache.hedis && Object.keys(this.cache.hedis).length > 0) 
      ? this.cache.hedis 
      : JSON.parse(localStorage.getItem('dccs-hedis-data') || '{}');
  },

  getHedisData(slId) {
    return this.getHedisStore()[slId] || { kpis: {}, customKpis: [], notes: '' };
  },

  getDialogueStore() {
    return (this.cache.dialogue && Object.keys(this.cache.dialogue).length > 0) 
      ? this.cache.dialogue 
      : JSON.parse(localStorage.getItem('dccs-dialogue-entries') || '{}');
  },

  getDialogueEntries(slId) {
    return this.getDialogueStore()[slId] || [];
  }
};

// Initialize synchronization
Sync.init();
