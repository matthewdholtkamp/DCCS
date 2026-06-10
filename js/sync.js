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
      
      // Enable Firestore offline persistence if available
      this.db.enablePersistence().catch((err) => {
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
      
      // Subscribe to real-time updates
      this.subscribe();
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
      try {
        this.unsubscribe();
      } catch (err) {
        console.warn("Error unsubscribing from Firestore snapshot:", err);
      }
      this.unsubscribe = null;
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

    const hasContent = (obj) => {
      if (!obj || typeof obj !== 'object') return false;
      for (const k in obj) {
        if (k === '_lastUpdated') continue;
        const val = obj[k];
        if (Array.isArray(val) && val.length > 0) return true;
        if (val && typeof val === 'object' && !Array.isArray(val) && Object.keys(val).length > 0) return true;
        if (typeof val === 'string' && val.trim().length > 0) return true;
        if (typeof val === 'number') return true;
      }
      return false;
    };

    // Listen to changes across all framework data documents in the dccs_data collection
    this.unsubscribe = this.db.collection("dccs_data").onSnapshot((snapshot) => {
      window.DCCS_DEBUG.snapshotFires++;
      let changed = false;

      // Skip snapshot updates during client-side optimistic writes to avoid layout jank
      if (snapshot.metadata.hasPendingWrites) {
        return;
      }

      snapshot.forEach((doc) => {
        const id = doc.id;
        const serverData = doc.data() || {};
        const localData = this.cache[id] || {};

        const serverTime = serverData._lastUpdated || 0;
        const localTime = localData._lastUpdated || 0;

        if (localTime > serverTime) {
          // Local data is newer (e.g. edited while offline or waiting for sync)
          this.uploadDocument(id, localData);
        } else if (serverTime > localTime) {
          // Server data is newer
          this.cache[id] = serverData;
          changed = true;
          if (id === 'er_data') {
            this.processERData(serverData);
          }
        } else if (JSON.stringify(localData) !== JSON.stringify(serverData)) {
          // Content differs but timestamps are missing/equal
          const localHasData = hasContent(localData);
          const serverHasData = hasContent(serverData);

          if (localHasData && !serverHasData) {
            // Local client has data but server is empty
            this.uploadDocument(id, localData);
          } else {
            // Revert/align to server representation
            this.cache[id] = serverData;
            changed = true;
            if (id === 'er_data') {
              this.processERData(serverData);
            }
          }
        }
      });

      this.setStatus('synced');

      if (changed) {
        // Update local backups
        if (this.cache.tasks) localStorage.setItem('dccs-task-data', JSON.stringify(this.cache.tasks));
        if (this.cache.metrics) localStorage.setItem('dccs-metric-entries', JSON.stringify(this.cache.metrics));
        if (this.cache.hedis) localStorage.setItem('dccs-hedis-data', JSON.stringify(this.cache.hedis));
        if (this.cache.dialogue) localStorage.setItem('dccs-dialogue-entries', JSON.stringify(this.cache.dialogue));
        if (this.cache.er_data) localStorage.setItem('dccs-er-data', JSON.stringify(this.cache.er_data));

        // Re-render current active view in App
        if (window.App && typeof App.route === "function") {
          App.route();
        }
      }
    }, (error) => {
      console.warn("Firestore subscription failed/lost, reverting to local backups:", error);
      this.disableSync();
    });
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
        await this.db.collection("dccs_data").doc("tasks").set(tasks, { merge: true });
        this.setStatus('synced');
      } catch (e) {
        console.error("Firestore failed to write task:", e);
        this.disableSync();
      }
    } else {
      this.setStatus('offline');
    }
  },

  async saveMetricStore(allMetrics) {
    allMetrics._lastUpdated = Date.now();
    this.cache.metrics = allMetrics;
    localStorage.setItem('dccs-metric-entries', JSON.stringify(allMetrics));

    if (this.enabled && this.db) {
      window.DCCS_DEBUG.firestoreWrites++;
      this.setStatus('syncing');
      try {
        await this.db.collection("dccs_data").doc("metrics").set(allMetrics, { merge: true });
        this.setStatus('synced');
      } catch (e) {
        console.error("Firestore failed to write metrics:", e);
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
        await this.db.collection("dccs_data").doc("hedis").set(hedis, { merge: true });
        this.setStatus('synced');
      } catch (e) {
        console.error("Firestore failed to write HEDIS:", e);
        this.disableSync();
      }
    } else {
      this.setStatus('offline');
    }
  },

  async saveDialogueEntries(slId, entries) {
    const dialogue = { ...this.getDialogueStore() };
    dialogue[slId] = entries;
    dialogue._lastUpdated = Date.now();
    this.cache.dialogue = dialogue;
    localStorage.setItem('dccs-dialogue-entries', JSON.stringify(dialogue));

    if (this.enabled && this.db) {
      window.DCCS_DEBUG.firestoreWrites++;
      this.setStatus('syncing');
      try {
        await this.db.collection("dccs_data").doc("dialogue").set(dialogue, { merge: true });
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
    try {
      let data = null;
      if (this.cache.er_data && Array.isArray(this.cache.er_data.allData) && this.cache.er_data.allData.length > 0) {
        data = this.cache.er_data;
        console.log("DCCS Sync: Using ER data from cached Firestore er_data doc.");
      }

      if (!data) {
        // 1. Try local sibling path first (useful for offline / local testing)
        try {
          const response = await fetch("../ER/data.json");
          if (response.ok) {
            data = await response.json();
            console.log("DCCS Sync: Successfully fetched ER data from local sibling path.");
          }
        } catch (err) {
          console.log("DCCS Sync: Local sibling fetch failed, trying public fallback...", err);
        }
      }

      // 2. If local fails, try public GitHub Pages URL
      if (!data) {
        try {
          const response = await fetch("https://matthewdholtkamp.github.io/ER/data.json");
          if (response.ok) {
            data = await response.json();
            console.log("DCCS Sync: Successfully fetched ER data from public URL.");
          }
        } catch (err) {
          console.error("DCCS Sync: Public fallback fetch failed.", err);
        }
      }

      if (!data || !Array.isArray(data.allData)) {
        console.warn("DCCS Sync: No valid ER data found to synchronize.");
        return;
      }

      await this.processERData(data);
    } catch (e) {
      console.error("DCCS Sync: Error executing ER metrics sync:", e);
    }
  },

  async processERData(data) {
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

    // Sort arrays chronologically
    const sortFn = (a, b) => a.date.localeCompare(b.date);
    erTotalCensus.sort(sortFn);
    erTotalTrainees.sort(sortFn);
    erEsi12.sort(sortFn);
    erEsi3.sort(sortFn);
    erEsi45.sort(sortFn);
    erLwobs.sort(sortFn);

    const store = { ...this.getMetricStore() };
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
      console.log("DCCS Sync: Detected updates in ER metrics, saving to store...");
      await this.saveMetricStore(store);
      if (window.App && typeof App.route === "function") {
        App.route();
      }
    } else {
      console.log("DCCS Sync: ER metrics are already up to date.");
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
