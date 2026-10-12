/* Local interface support: chart names for screen readers, navigation icons, URL routing and
   focus management. Native controls remain the primary interaction. */
(function () {
  'use strict';
  document.documentElement.lang = 'en';
  let pendingFocus = null;
  /* ggiraph paints its SVG asynchronously, after shiny:value has already fired, so an observer on
     each chart shell names whatever SVG turns up, however late, and again after a redraw. */
  function nameChartSvg(shell) {
    const svg = shell.querySelector('svg');
    if (!svg || !shell.dataset.chartLabel) return;
    if (svg.getAttribute('aria-label') === shell.dataset.chartLabel) return;
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', shell.dataset.chartLabel);
    svg.setAttribute('focusable', 'false');
  }
  const chartWatcher = new MutationObserver(records => {
    const shells = new Set();
    records.forEach(r => {
      const host = r.target.closest ? r.target.closest('.chart-shell') : null;
      if (host) shells.add(host);
    });
    shells.forEach(nameChartSvg);
  });
  function watchCharts() {
    document.querySelectorAll('.chart-shell').forEach(shell => {
      if (shell.dataset.a11yWatched) return;
      shell.dataset.a11yWatched = '1';
      chartWatcher.observe(shell, {childList: true, subtree: true});
      nameChartSvg(shell);
    });
  }
  const paths = {today:'<path d="M12 21S3 15.3 3 8.5A4.5 4.5 0 0 1 12 6a4.5 4.5 0 0 1 9 2.5C21 15.3 12 21 12 21Z"/>',choices:'<path d="M4 5h16M4 12h16M4 19h16"/><circle cx="8" cy="5" r="2.5" fill="white"/><circle cx="16" cy="12" r="2.5" fill="white"/><circle cx="10" cy="19" r="2.5" fill="white"/>',habits:'<circle cx="7" cy="8" r="3"/><circle cx="17" cy="8" r="3"/><path d="M2 20c.6-3.4 2.4-5 5-5s4.4 1.6 5 5M12 20c.6-3.4 2.4-5 5-5s4.4 1.6 5 5"/>'};
  function enhance() {
    /* A tablist may only contain tabs, so the back button must not live inside ul#page. The list
       is wrapped once, in place, in a navigation landmark that holds the dock styling; the button
       sits in the wrapper just before the list, so it looks the same as before. */
    const nav = document.getElementById('page');
    const back = document.getElementById('floating_back_overview');
    if (nav && !nav.parentElement.classList.contains('page-dock')) {
      const dock = document.createElement('nav');
      dock.className = 'page-dock'; dock.setAttribute('aria-label', 'Pages');
      nav.parentNode.insertBefore(dock, nav); dock.appendChild(nav);
    }
    if (nav && back && back.parentElement !== nav.parentElement) nav.parentElement.insertBefore(back, nav);
    document.querySelectorAll('#page > li > a[data-value]').forEach(a => {
      if (!a.querySelector('.nav-icon') && paths[a.dataset.value]) {
        a.insertAdjacentHTML('afterbegin', '<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths[a.dataset.value] + '</svg>');
      }
    });
    watchCharts();
    document.querySelectorAll('.shiny-date-input').forEach(container => {
      const input = container.querySelector('input'); const label = container.querySelector('label');
      if (input && label) { if (!input.id) input.id = container.id + '-field'; label.id = container.id + '-label'; label.htmlFor = container.id; input.setAttribute('aria-labelledby', label.id); }
    });
  }
  /* Routing: "#today", "#today/sleep", "#choices", "#habits". The server tells us where it went;
     we push a history entry only when the hash really changes, so the browser Back button walks
     back through pages and drill-downs, and a refresh reopens the same view. */
  function currentRoute() { return location.hash.slice(1); }
  document.body ? document.body.dataset.page = 'today' : document.addEventListener('DOMContentLoaded', () => { document.body.dataset.page = 'today'; });
  $(document).on('shiny:connected', function () {
    enhance();
    const h = currentRoute();
    if (h) Shiny.setInputValue('route', h, {priority: 'event'});
  });
  window.addEventListener('popstate', function () {
    Shiny.setInputValue('route', currentRoute() || 'today', {priority: 'event'});
  });
  $(document).on('shiny:value shown.bs.tab', function () { requestAnimationFrame(enhance); });
  $(document).on('shiny:idle', function () { watchCharts(); });
  Shiny.addCustomMessageHandler('route', function (x) {
    const route = x.section && x.section !== 'overview' ? x.page + '/' + x.section : x.page;
    if (currentRoute() !== route) {
      if (!currentRoute() && route === 'today') history.replaceState({route: route}, '', '#' + route);
      else history.pushState({route: route}, '', '#' + route);
    }
    document.body.dataset.page = x.page;
    const back = document.getElementById('floating_back_overview');
    const detail = x.page === 'today' && x.section && x.section !== 'overview';
    if (back) { back.classList.toggle('show', detail); back.setAttribute('aria-hidden', detail ? 'false' : 'true'); }
    window.scrollTo({top: 0, behavior: 'instant'});
    enhance();
  });
  document.addEventListener('click', function (event) {
    const drill = event.target.closest('.home-metric-card,.back-to-overview');
    if (drill) pendingFocus = '#main_content';
    const date = event.target.closest('[data-date-input]');
    if (date) pendingFocus = '#main_content';
    if (event.target.closest('.day-button')) pendingFocus = '#main_content';
    if (date) { Shiny.setInputValue(date.dataset.dateInput, date.dataset.date, {priority: 'event'}); }
    const skip = event.target.closest('.skip-link'); if (skip) { event.preventDefault(); document.getElementById('main_content').focus(); document.getElementById('main_content').scrollIntoView(); }
  });
  document.addEventListener('keydown', function (event) {
    const a = event.target.closest('#page > li > a'); if (!a) return;
    const tabs = Array.from(document.querySelectorAll('#page > li > a')); let i = tabs.indexOf(a);
    if (event.key === 'ArrowRight') i = (i + 1) % tabs.length; else if (event.key === 'ArrowLeft') i = (i + tabs.length - 1) % tabs.length;
    else if (event.key === 'Home') i = 0; else if (event.key === 'End') i = tabs.length - 1; else return;
    event.preventDefault(); tabs[i].click(); tabs[i].focus();
  });
  $(document).on('shiny:idle', function () { if (pendingFocus) { const target = document.querySelector(pendingFocus); pendingFocus = null; if (target) { target.tabIndex = -1; target.focus({preventScroll: true}); } } });
  $(document).on('shown.bs.modal', function () {
    const modal = document.querySelector('.modal.show'); if (!modal) return;
    const title = modal.querySelector('.modal-title'); if (title) { title.id = 'about-modal-title'; modal.setAttribute('aria-labelledby', title.id); }
  });
  /* Closing the About dialog returns focus to the link that opened it. Shiny removes the dialog
     right after it hides, so the focus is set on the next tick and again once removal is done. */
  function returnFocusToAbout() {
    const about = document.getElementById('about'); if (!about) return;
    [0, 120].forEach(ms => setTimeout(() => { const a = document.activeElement; if (!a || a === document.body || !document.contains(a)) about.focus(); }, ms));
  }
  $(document).on('hidden.bs.modal', returnFocusToAbout);
  document.addEventListener('hidden.bs.modal', returnFocusToAbout);
  /* Outputs inside a closed <details> are suspended by Shiny. Opening one fires 'shown' so its
     charts and tables render, and a resize so an echarts canvas takes the right width. */
  document.addEventListener('toggle', function (event) {
    const el = event.target;
    if (el.tagName === 'DETAILS' && el.open) { $(el).trigger('shown'); setTimeout(function () { window.dispatchEvent(new Event('resize')); }, 60); }
  }, true);
  document.addEventListener('DOMContentLoaded', enhance);
})();
