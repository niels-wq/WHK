/* Werkhervattingskas chatwidget. Vanilla JS, geen cookies (sessionStorage voor het gesprek).
   Chatknop 12px boven de contactknop. Contactmenu open: chatknop weg. Chat open: contactknop weg.
   Cookiebanner en mobiele contactbalk schuiven de knoppen omhoog. Exit-popup open: knoppen weg.
   GA4 alleen via gtag/dataLayer als die er zijn, zonder berichttekst of persoonsgegevens. */
(function () {
  'use strict';
  if (window.__WHK_CHAT_BOOTED) return;
  window.__WHK_CHAT_BOOTED = true;
  var C = window.WHK_CHAT || {};
  var root = document.getElementById('whk-chat');
  if (!root) {
    root = document.createElement('div');
    root.id = 'whk-chat';
    root.className = 'whkchat';
    document.body.appendChild(root);
  }
  root.className = 'whkchat';
  document.documentElement.classList.add('whkchat-on');

  var SS = 'whk_chat_v1';
  var state = null;
  try { state = JSON.parse(sessionStorage.getItem(SS) || 'null'); } catch (e) {}
  if (!state || !state.session) {
    state = { session: rid(), msgs: [], teaser: 0, leadEvent: false };
  }

  function rid() {
    var a = new Uint8Array(16);
    (window.crypto || window.msCrypto).getRandomValues(a);
    return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }
  function save() {
    state.msgs = (state.msgs || []).slice(-30);
    try { sessionStorage.setItem(SS, JSON.stringify(state)); } catch (e) {}
  }
  function track(name, params) {
    params = params || {};
    try {
      var payload = { event: name };
      Object.keys(params).forEach(function (k) { payload[k] = params[k]; });
      if (window.dataLayer && typeof window.dataLayer.push === 'function') window.dataLayer.push(payload);
      if (typeof window.gtag === 'function') window.gtag('event', name, params);
    } catch (e) {}
  }
  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }
  function apiUrl() {
    var url = C.api || '/api/chat/message';
    if (C.preview) url += (url.indexOf('?') === -1 ? '?' : '&') + 'chatpreview=1';
    return url;
  }

  var stack = el('div', 'whkchat__stack');
  var launch = el('div', 'whkchat__launch');
  var launcher = el('button', 'whkchat__launcher');
  launcher.type = 'button';
  launcher.setAttribute('aria-label', 'Open de chat');
  var img = el('img');
  img.src = C.avatar || '/assets/niels-avatar.webp';
  img.alt = '';
  launcher.appendChild(img);
  launcher.appendChild(el('span', 'whkchat__dot'));
  var teaser = el('div', 'whkchat__teaser');
  teaser.hidden = true;
  var teaserBtn = el('button', 'whkchat__teaser-open', C.teaser || 'Vraag het Niels');
  teaserBtn.type = 'button';
  var teaserX = el('button', 'whkchat__teaser-x', '×');
  teaserX.type = 'button';
  teaserX.setAttribute('aria-label', 'Teaser sluiten');
  teaser.appendChild(teaserBtn);
  teaser.appendChild(teaserX);
  launch.appendChild(teaser);
  launch.appendChild(launcher);

  var menu = el('div', 'whkchat__menu');
  menu.hidden = true;
  menu.setAttribute('role', 'menu');
  function addLink(label, href, channel) {
    var a = el('a', '', label);
    a.href = href;
    if (/^https?:/.test(href)) { a.target = '_blank'; a.rel = 'noopener'; }
    a.setAttribute('data-channel', channel);
    a.addEventListener('click', function () { track('chat_contact_click', { channel: channel }); closeContact(); });
    menu.appendChild(a);
  }
  addLink('WhatsApp', C.whatsapp || 'https://wa.me/31650213593', 'whatsapp');
  addLink('Bellen ' + (C.phoneDisplay || '06-50213593'), 'tel:' + (C.phoneTel || '+31650213593'), 'phone');
  var callback = el('button', '', 'Terugbelverzoek');
  callback.type = 'button';
  callback.setAttribute('data-channel', 'callback');
  callback.addEventListener('click', function () {
    track('chat_contact_click', { channel: 'callback' });
    closeContact();
    var btn = document.getElementById('open-terugbel') || document.getElementById('scb-terugbel');
    if (btn) btn.click();
    else {
      var modal = document.getElementById('terugbel-modal');
      if (modal) modal.classList.add('show');
    }
  });
  menu.appendChild(callback);
  addLink('E-mail', 'mailto:' + (C.email || 'info@werkhervattingskas.nl'), 'email');
  addLink('Gratis WHK-check', C.checkPath || '/', 'check');

  var contactBtn = el('button', 'whkchat__contact');
  contactBtn.type = 'button';
  contactBtn.setAttribute('aria-expanded', 'false');
  contactBtn.setAttribute('aria-label', 'Contact');
  contactBtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 6.5h14v9H8l-3 2.5V6.5z" stroke-linejoin="round"/></svg><span>Contact</span>';

  stack.appendChild(launch);
  stack.appendChild(menu);
  stack.appendChild(contactBtn);

  var panel = el('section', 'whkchat__panel');
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-labelledby', 'whkchat-title');
  var head = el('div', 'whkchat__head');
  var headImg = el('img');
  headImg.src = img.src;
  headImg.alt = '';
  var headTxt = el('div', 'whkchat__head-txt');
  var title = el('p', 'whkchat__title', (C.name || 'Niels Alderding') + ', ' + (C.title || 'arbeidsdeskundige'));
  title.id = 'whkchat-title';
  headTxt.appendChild(title);
  headTxt.appendChild(el('p', 'whkchat__sub', C.subtitle || 'Meestal direct antwoord'));
  var closeBtn = el('button', 'whkchat__close', '×');
  closeBtn.type = 'button';
  closeBtn.setAttribute('aria-label', 'Chat sluiten');
  head.appendChild(headImg);
  head.appendChild(headTxt);
  head.appendChild(closeBtn);
  var log = el('div', 'whkchat__log');
  log.setAttribute('aria-live', 'polite');
  var chips = el('div', 'whkchat__chips');
  var form = el('form', 'whkchat__form');
  var input = el('textarea', 'whkchat__input');
  input.rows = 1;
  input.maxLength = 500;
  input.placeholder = 'Typ uw vraag...';
  input.setAttribute('aria-label', 'Uw vraag');
  var sendBtn = el('button', 'whkchat__send');
  sendBtn.type = 'submit';
  sendBtn.setAttribute('aria-label', 'Verstuur');
  sendBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" aria-hidden="true"><path d="M4 12h14M13 6l6 6-6 6"/></svg>';
  form.appendChild(input);
  form.appendChild(sendBtn);
  var notice = el('p', 'whkchat__notice');
  notice.appendChild(document.createTextNode((C.notice || 'Dit gesprek wordt verwerkt door AI (xAI). Deel geen medische gegevens.') + ' '));
  var privacy = el('a', '', 'Privacy');
  privacy.href = C.privacyPath || '/privacy';
  notice.appendChild(privacy);
  notice.appendChild(document.createTextNode(' · '));
  var callMe = el('button', 'whkchat__linkbtn', 'Liever teruggebeld?');
  callMe.type = 'button';
  notice.appendChild(callMe);
  panel.appendChild(head);
  panel.appendChild(log);
  panel.appendChild(chips);
  panel.appendChild(form);
  panel.appendChild(notice);
  root.appendChild(stack);
  root.appendChild(panel);

  var busy = false;
  var lastFocus = null;
  var welcomed = false;

  function isOpen() { return root.classList.contains('is-open'); }
  function mobile() { return window.matchMedia('(max-width: 879px)').matches; }

  function place() {
    var lift = window.innerWidth >= 880 ? 22 : 16;
    function raise(node) {
      if (!node) return;
      var cs = window.getComputedStyle(node);
      if (cs.display === 'none' || cs.visibility === 'hidden') return;
      var r = node.getBoundingClientRect();
      if (r.height < 20 || r.bottom < window.innerHeight - 8) return;
      lift = Math.max(lift, Math.round(window.innerHeight - r.top) + 12);
    }
    var banner = document.getElementById('cookie-banner');
    if (banner && banner.classList.contains('show')) raise(banner);
    var sticky = document.getElementById('sticky-contact-bar');
    if (sticky && sticky.classList.contains('show')) raise(sticky);
    root.style.setProperty('--whkchat-lift', lift + 'px');
    var exit = document.getElementById('exit-intent-bg');
    var exitOn = !!(exit && exit.classList.contains('show'));
    document.documentElement.classList.toggle('whkchat-exit', exitOn && !isOpen());
    if (exitOn && isOpen() && exit) exit.classList.remove('show');
  }

  function hideTeaser(dismiss) {
    teaser.hidden = true;
    if (dismiss) { state.teaser = 2; save(); }
  }
  function closeContact() {
    menu.hidden = true;
    root.classList.remove('is-contact-open');
    contactBtn.setAttribute('aria-expanded', 'false');
  }
  function openContact() {
    if (isOpen()) closeChat();
    menu.hidden = false;
    root.classList.add('is-contact-open');
    contactBtn.setAttribute('aria-expanded', 'true');
    hideTeaser(false);
    var first = menu.querySelector('a,button');
    if (first) first.focus();
  }
  function toggleContact() {
    if (root.classList.contains('is-contact-open')) closeContact();
    else openContact();
  }

  function safeHref(url) {
    var u = String(url || '').replace(/[.,;:!?)]+$/, '');
    if (/^\/(?!\/)/.test(u)) return u;
    if (/^https?:\/\/(www\.)?werkhervattingskas\.nl(\/|$)/i.test(u)) return u;
    if (/^https:\/\/wa\.me\/31650213593(\?|$)/i.test(u)) return u;
    if (/^mailto:[^\s]+$/i.test(u)) return u;
    if (/^tel:\+?[0-9]+$/i.test(u)) return u;
    return '';
  }
  function addLinkified(parent, text) {
    var re = /\[([^\]\n]+)\]\(([^)\s]+)\)|(https?:\/\/[^\s<>()]+)|([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})|(\/[\w\-\/]+)/g;
    var last = 0;
    var m;
    var s = String(text || '');
    while ((m = re.exec(s))) {
      if (m.index > last) parent.appendChild(document.createTextNode(s.slice(last, m.index)));
      if (m[1]) link(parent, m[2], m[1]);
      else if (m[3]) link(parent, m[3], m[3].replace(/^https?:\/\/(www\.)?/, ''));
      else if (m[4]) link(parent, 'mailto:' + m[4], m[4]);
      else if (m[5]) link(parent, m[5], m[5]);
      last = re.lastIndex;
    }
    if (last < s.length) parent.appendChild(document.createTextNode(s.slice(last)));
  }
  function link(parent, href, label) {
    var h = safeHref(href);
    if (!h) { parent.appendChild(document.createTextNode(label)); return; }
    var a = el('a', '', label);
    a.href = h;
    if (/^https?:/.test(h)) { a.target = '_blank'; a.rel = 'noopener'; }
    parent.appendChild(a);
  }
  function bubble(text, who) {
    var box = el('div', 'whkchat__msg whkchat__msg--' + who);
    String(text || '').split(/\n{2,}/).forEach(function (block) {
      var p = el('p');
      addLinkified(p, block.trim());
      box.appendChild(p);
    });
    log.appendChild(box);
    log.scrollTop = log.scrollHeight;
    return box;
  }
  function showOffer() {
    if (log.querySelector('.whkchat__offer')) return;
    var b = el('button', 'whkchat__offer', 'Gegevens achterlaten');
    b.type = 'button';
    b.addEventListener('click', function () { showLeadForm(); });
    log.appendChild(b);
    log.scrollTop = log.scrollHeight;
  }
  function showLeadForm() {
    if (log.querySelector('.whkchat__lead')) {
      var existing = log.querySelector('.whkchat__lead');
      existing.scrollIntoView({ block: 'nearest' });
      return;
    }
    chips.hidden = true;
    track('chat_lead_form_view', {});
    var box = el('form', 'whkchat__lead');
    box.noValidate = true;
    var h = el('h3', '', 'Gegevens achterlaten');
    var intro = el('p', '', 'Laat uw naam achter, plus een e-mailadres of telefoonnummer. We gebruiken dit alleen om contact op te nemen over uw vraag.');
    var grid = el('div', 'whkchat__grid');
    function field(name, label, type, wide) {
      var wrap = el('label', 'whkchat__field' + (wide ? ' whkchat__field--wide' : ''));
      wrap.appendChild(document.createTextNode(label));
      var inputEl = type === 'textarea' ? el('textarea') : el('input');
      if (type !== 'textarea') inputEl.type = type || 'text';
      inputEl.name = name;
      inputEl.autocomplete = name === 'email' ? 'email' : (name === 'phone' ? 'tel' : 'name');
      wrap.appendChild(inputEl);
      grid.appendChild(wrap);
      return inputEl;
    }
    var nameEl = field('name', 'Naam', 'text', false);
    var orgEl = field('org', 'Organisatie', 'text', false);
    var emailEl = field('email', 'E-mail', 'email', false);
    var phoneEl = field('phone', 'Telefoon', 'tel', false);
    var msgEl = field('message', 'Uw vraag (optioneel)', 'textarea', true);
    var hp = el('input', 'whkchat__hp');
    hp.type = 'text';
    hp.name = 'website';
    hp.tabIndex = -1;
    hp.autocomplete = 'off';
    var err = el('p', 'whkchat__err');
    err.hidden = true;
    var submit = el('button', 'whkchat__submit', 'Verstuur');
    submit.type = 'submit';
    box.appendChild(h);
    box.appendChild(intro);
    box.appendChild(grid);
    box.appendChild(hp);
    box.appendChild(err);
    box.appendChild(submit);
    box.addEventListener('submit', function (ev) {
      ev.preventDefault();
      err.hidden = true;
      nameEl.removeAttribute('aria-invalid');
      var name = nameEl.value.trim();
      var email = emailEl.value.trim();
      var phone = phoneEl.value.trim();
      if (name.length < 2 || (!email && !phone)) {
        err.hidden = false;
        err.textContent = 'Naam en telefoon of e-mail zijn verplicht.';
        nameEl.setAttribute('aria-invalid', 'true');
        return;
      }
      submit.disabled = true;
      var page = location.pathname || '/';
      var message = '';
      if (orgEl.value.trim()) message += 'Organisatie: ' + orgEl.value.trim() + '\n';
      if (msgEl.value.trim()) message += msgEl.value.trim();
      fetch(C.leadApi || '/api/lead/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name,
          email: email,
          phone: phone,
          source: 'chat',
          page: page,
          message: message,
          website: hp.value
        })
      }).then(function (r) { return r.json().then(function (data) { return { ok: r.ok, data: data }; }); }).then(function (res) {
        if (!res.ok || !res.data || !res.data.ok) {
          err.hidden = false;
          err.textContent = (res.data && res.data.error) || 'Versturen lukte niet. Bel ' + (C.phoneDisplay || '06-50213593') + '.';
          submit.disabled = false;
          return;
        }
        box.innerHTML = '';
        box.appendChild(el('p', 'whkchat__ok', 'Bedankt. We hebben uw gegevens ontvangen en nemen contact met u op.'));
        if (res.data.status !== 'spam') track('generate_lead', { method: 'chat', lead_source: 'chat_form' });
      }).catch(function () {
        err.hidden = false;
        err.textContent = 'Versturen lukte niet. Bel ' + (C.phoneDisplay || '06-50213593') + ' of mail ' + (C.email || 'info@werkhervattingskas.nl') + '.';
        submit.disabled = false;
      });
    });
    log.appendChild(box);
    log.scrollTop = log.scrollHeight;
    nameEl.focus();
  }

  function renderChips() {
    chips.innerHTML = '';
    if ((state.msgs || []).length) { chips.hidden = true; return; }
    chips.hidden = false;
    (C.chips || []).forEach(function (raw) {
      var parts = String(raw).split('|');
      var label = parts[0];
      var lead = parts[1] === 'lead';
      var b = el('button', 'whkchat__chip' + (lead ? ' whkchat__chip--lead' : ''), label);
      b.type = 'button';
      b.addEventListener('click', function () {
        if (lead) { showLeadForm(); return; }
        input.value = label;
        sendText(label);
      });
      chips.appendChild(b);
    });
  }

  function welcome() {
    if (welcomed) return;
    welcomed = true;
    if ((state.msgs || []).length) {
      state.msgs.forEach(function (m) { bubble(m.content, m.role === 'user' ? 'user' : 'bot'); });
      chips.hidden = true;
      return;
    }
    bubble(C.welcome || 'Goedendag. Waar kan ik u mee helpen?', 'bot');
    renderChips();
  }

  function openChat() {
    closeContact();
    lastFocus = document.activeElement;
    root.classList.add('is-open');
    panel.hidden = false;
    launcher.setAttribute('aria-expanded', 'true');
    if (mobile()) document.documentElement.classList.add('whkchat-noscroll');
    hideTeaser(false);
    welcome();
    place();
    track('chat_open', {});
    window.setTimeout(function () { (closeBtn || input).focus(); }, 30);
  }
  function closeChat() {
    root.classList.remove('is-open');
    panel.hidden = true;
    launcher.setAttribute('aria-expanded', 'false');
    document.documentElement.classList.remove('whkchat-noscroll');
    place();
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function sendText(text) {
    var value = String(text || '').trim();
    if (!value || busy) return;
    if (value.length > 500) {
      bubble('Uw bericht is te lang. Houd het bij maximaal 500 tekens.', 'bot');
      return;
    }
    chips.hidden = true;
    state.msgs = state.msgs || [];
    state.msgs.push({ role: 'user', content: value });
    save();
    bubble(value, 'user');
    input.value = '';
    track('chat_message', { role: 'user' });
    var typing = el('div', 'whkchat__msg whkchat__msg--bot');
    typing.innerHTML = '<span class="whkchat__typing"><i></i><i></i><i></i></span>';
    log.appendChild(typing);
    log.scrollTop = log.scrollHeight;
    busy = true;
    sendBtn.disabled = true;
    fetch(apiUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session: state.session,
        page: location.pathname || '/',
        messages: state.msgs
      })
    }).then(function (r) { return r.json().then(function (data) { return { status: r.status, data: data }; }); }).then(function (res) {
      typing.remove();
      var data = res.data || {};
      var reply = data.reply || data.error || 'Even geen antwoord. Bel ' + (C.phoneDisplay || '06-50213593') + ' of mail ' + (C.email || 'info@werkhervattingskas.nl') + '.';
      state.msgs.push({ role: 'assistant', content: reply });
      save();
      bubble(reply, 'bot');
      track('chat_message', { role: 'assistant' });
      if (data.lead && !state.leadEvent) {
        state.leadEvent = true;
        save();
        track('generate_lead', { method: 'chat', lead_source: 'chat_message' });
      }
      if (data.action === 'lead_form') showLeadForm();
      else if (data.action === 'lead_offer' || data.fallback) showOffer();
    }).catch(function () {
      typing.remove();
      bubble('Even geen antwoord. Bel ' + (C.phoneDisplay || '06-50213593') + ' of mail ' + (C.email || 'info@werkhervattingskas.nl') + '.', 'bot');
      showOffer();
    }).then(function () {
      busy = false;
      sendBtn.disabled = false;
      input.focus();
    });
  }

  launcher.addEventListener('click', openChat);
  teaserBtn.addEventListener('click', openChat);
  teaserX.addEventListener('click', function (e) { e.stopPropagation(); hideTeaser(true); });
  contactBtn.addEventListener('click', toggleContact);
  closeBtn.addEventListener('click', closeChat);
  callMe.addEventListener('click', function () { showLeadForm(); });
  form.addEventListener('submit', function (e) { e.preventDefault(); sendText(input.value); });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendText(input.value); }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (isOpen()) { e.preventDefault(); closeChat(); }
    else if (root.classList.contains('is-contact-open')) closeContact();
  });
  document.addEventListener('click', function (e) {
    if (!root.classList.contains('is-contact-open')) return;
    if (!root.contains(e.target)) closeContact();
  });
  panel.addEventListener('keydown', function (e) {
    if (e.key !== 'Tab' || !isOpen()) return;
    var nodes = panel.querySelectorAll('button,a,input,textarea');
    var list = Array.prototype.filter.call(nodes, function (n) { return !n.disabled && n.offsetParent !== null; });
    if (!list.length) return;
    var first = list[0];
    var last = list[list.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  window.addEventListener('resize', place);
  window.addEventListener('scroll', place, { passive: true });
  if (window.MutationObserver) {
    var obs = new MutationObserver(place);
    ['cookie-banner', 'sticky-contact-bar', 'exit-intent-bg'].forEach(function (id) {
      var n = document.getElementById(id);
      if (n) obs.observe(n, { attributes: true, attributeFilter: ['class'] });
    });
  }
  place();
  if (state.teaser !== 2) {
    window.setTimeout(function () {
      if (state.teaser === 2 || isOpen() || root.classList.contains('is-contact-open') || document.documentElement.classList.contains('whkchat-exit')) return;
      teaser.hidden = false;
      state.teaser = 1;
      save();
    }, 1200);
  }
  if (/[?&]chatpreview=1(?:&|$)/.test(location.search) && /[?&]chatopen=1(?:&|$)/.test(location.search)) {
    openChat();
  }
})();
