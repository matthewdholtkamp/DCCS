// DCCS Operational Framework — Real-Time Firebase Sync Layer
const Sync = {
  db: null,
  enabled: false,
  cache: {
    tasks: {},
    metrics: {},
    hedis: {},
    dialogue: {}
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
      console.log("Firebase Sync Layer successfully initialized.");
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
      this.loadLocalBackup();
    }
  },

  loadLocalBackup() {
    try {
      this.cache.tasks = JSON.parse(localStorage.getItem('dccs-task-data') || '{}');
      this.cache.metrics = JSON.parse(localStorage.getItem('dccs-metric-entries') || '{}');
      this.cache.hedis = JSON.parse(localStorage.getItem('dccs-hedis-data') || '{}');
      this.cache.dialogue = JSON.parse(localStorage.getItem('dccs-dialogue-entries') || '{}');
    } catch (e) {
      console.error("Failed to load local backup data:", e);
    }
  },

  subscribe() {
    if (!this.enabled || !this.db) return;

    this.setStatus('syncing');
    // Listen to changes across all framework data documents in the dccs_data collection
    this.db.collection("dccs_data").onSnapshot((snapshot) => {
      let changed = false;
      snapshot.forEach((doc) => {
        const id = doc.id;
        const data = doc.data() || {};
        if (JSON.stringify(this.cache[id]) !== JSON.stringify(data)) {
          this.cache[id] = data;
          changed = true;
        }
      });

      this.setStatus('synced');

      if (changed) {
        console.log("Remote updates received. Syncing cache and updating page.");
        
        // Update local backups
        if (this.cache.tasks) localStorage.setItem('dccs-task-data', JSON.stringify(this.cache.tasks));
        if (this.cache.metrics) localStorage.setItem('dccs-metric-entries', JSON.stringify(this.cache.metrics));
        if (this.cache.hedis) localStorage.setItem('dccs-hedis-data', JSON.stringify(this.cache.hedis));
        if (this.cache.dialogue) localStorage.setItem('dccs-dialogue-entries', JSON.stringify(this.cache.dialogue));

        // Re-render current active view in App
        if (window.App && typeof App.route === "function") {
          App.route();
        }
      }
    }, (error) => {
      console.warn("Firestore subscription lost, reverting to local backups:", error);
      this.setStatus('offline');
      this.loadLocalBackup();
    });
  },

  // ===== WRITER INTERFACES =====
  async saveTaskData(taskId, data) {
    const tasks = { ...this.getTaskStore() };
    tasks[taskId] = { ...tasks[taskId], ...data };
    this.cache.tasks = tasks;
    localStorage.setItem('dccs-task-data', JSON.stringify(tasks));

    if (this.enabled && this.db) {
      this.setStatus('syncing');
      try {
        await this.db.collection("dccs_data").doc("tasks").set(tasks, { merge: true });
        this.setStatus('synced');
      } catch (e) {
        console.error("Firestore failed to write task:", e);
        this.setStatus('offline');
      }
    } else {
      this.setStatus('offline');
    }
  },

  async saveMetricStore(allMetrics) {
    this.cache.metrics = allMetrics;
    localStorage.setItem('dccs-metric-entries', JSON.stringify(allMetrics));

    if (this.enabled && this.db) {
      this.setStatus('syncing');
      try {
        await this.db.collection("dccs_data").doc("metrics").set(allMetrics);
        this.setStatus('synced');
      } catch (e) {
        console.error("Firestore failed to write metrics:", e);
        this.setStatus('offline');
      }
    } else {
      this.setStatus('offline');
    }
  },

  async saveHedisData(slId, update) {
    const hedis = { ...this.getHedisStore() };
    const current = hedis[slId] || { kpis: {}, customKpis: [], notes: '' };
    hedis[slId] = { ...current, ...update };
    this.cache.hedis = hedis;
    localStorage.setItem('dccs-hedis-data', JSON.stringify(hedis));

    if (this.enabled && this.db) {
      this.setStatus('syncing');
      try {
        await this.db.collection("dccs_data").doc("hedis").set(hedis);
        this.setStatus('synced');
      } catch (e) {
        console.error("Firestore failed to write HEDIS:", e);
        this.setStatus('offline');
      }
    } else {
      this.setStatus('offline');
    }
  },

  async saveDialogueEntries(slId, entries) {
    const dialogue = { ...this.getDialogueStore() };
    dialogue[slId] = entries;
    this.cache.dialogue = dialogue;
    localStorage.setItem('dccs-dialogue-entries', JSON.stringify(dialogue));

    if (this.enabled && this.db) {
      this.setStatus('syncing');
      try {
        await this.db.collection("dccs_data").doc("dialogue").set(dialogue);
        this.setStatus('synced');
      } catch (e) {
        console.error("Firestore failed to write dialogue entries:", e);
        this.setStatus('offline');
      }
    } else {
      this.setStatus('offline');
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
