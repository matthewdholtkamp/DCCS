// DCCS Operational Framework - Bootstrap
(function () {
  window.App = window.App || {};
  Object.assign(window.App, {
    init() {
      window.addEventListener('hashchange', () => this.route());
      document.addEventListener('focus', (e) => {
        if (e.target.classList?.contains('input-error')) {
          e.target.classList.remove('input-error');
        }
      }, true);
      document.addEventListener('blur', () => {
        setTimeout(() => this.applyStalePatches(), 50);
      }, true);
      this.purgeRetiredMetricData();
      this.initUserChip();
      this.route();
    }
  });

  const App = window.App;

  window.App = App;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => App.init());
  } else {
    App.init();
  }
}());
