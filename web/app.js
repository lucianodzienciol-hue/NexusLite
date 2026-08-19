
    const API_BASE = '/api';

    const SUPABASE_URL = 'https://rjtoqsyrxvtipacnxdld.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJqdG9xc3lyeHZ0aXBhY254ZGxkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcwODI4MjIsImV4cCI6MjEwMjY1ODgyMn0.Uhdn0hqF6-LnLM-E4BU249hf6HU3pTv2_NkhYQiE9-g';

    function mapSbProduct(p) {
      const n = v => Number(v) || 0;
      return {
        id: p.id, code: p.code || '', name: p.name || '', price: n(p.price), cost: n(p.cost),
        stock: n(p.stock), category: p.category || '', source: p.source || 'web', description: p.description || '',
        image: p.image || '', oferta: p.oferta || 0, nuevo: p.nuevo || 0, webDesc: p.web_desc || '',
        ofertaPrice: n(p.oferta_price), fichaTecnica: p.ficha_tecnica || '', fichaTecnicaFile: p.ficha_tecnica_file || '',
      };
    }

    async function loadFromSupabase() {
      const sbUrl = (allConfig && allConfig.supabaseUrl) || SUPABASE_URL;
      const sbKey = (allConfig && allConfig.supabaseKey) || SUPABASE_ANON_KEY;
      if (!sbUrl || !sbKey) throw new Error('Sin credenciales Supabase');
      const H = { apikey: sbKey, Authorization: 'Bearer ' + sbKey };
      const j = async p => {
        const r = await fetch(sbUrl + '/rest/v1/' + p, { headers: H, signal: AbortSignal.timeout(10000) });
        if (!r.ok) throw new Error('Supabase ' + r.status);
        return r.json();
      };
      const [prods, cats, cfgArr] = await Promise.all([
        j('products?select=*&order=id'),
        j('web_categories?select=*&order=name'),
        j('app_config?key=eq.webConfig&select=value'),
      ]);
      const cfg = (cfgArr && cfgArr[0] && cfgArr[0].value) || {};
      return {
        products: (prods || []).map(mapSbProduct),
        categories: cats || [],
        config: { ...cfg, supabaseUrl: sbUrl, supabaseKey: sbKey },
      };
    }

    let allProducts = [];
    let allCategories = [];
    let allBanners = [];
    let allConfig = {};
    let activeCategory = '';
    let heroInterval = null;
    let heroIndex = 0;

    const STOCK_IMAGES = {
      'default': 'https://picsum.photos/seed/producto/400/400',
    };

    function getProductImg(p) {
      return p.image || STOCK_IMAGES[p.category] || STOCK_IMAGES['default'];
    }

    function esc(v) {
      return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    }

    function safeUrl(v) {
      var s = String(v || '').trim();
      return /^(javascript:|data:text\/html|vbscript:)/i.test(s) ? '#' : s;
    }

    function safeImg(v) {
      var s = String(v || '').trim();
      return /^(javascript:|vbscript:)/i.test(s) ? '' : s;
    }

    function jsStr(v) {
      return encodeURIComponent(String(v == null ? '' : v)).replace(/'/g, '%27');
    }

    // ===== HERO =====
    function renderHero(banners) {
      const el = document.getElementById('heroSlider');
      if (!banners || banners.length === 0) {
        el.style.display = 'none';
        return;
      }
      el.style.display = 'block';
      const slides = banners.map((b, i) => `
        <div class="hero-slide ${i === 0 ? 'active' : ''}" style="background-image: url('${safeImg(b.image) || 'https://picsum.photos/seed/banner1/1200/600'}')">
          <div class="hero-overlay"></div>
          <div class="hero-content">
            <h2>${esc(b.title || '')}</h2>
            <p>${esc(b.description || '')}</p>
            ${b.link ? `<a href="${safeUrl(b.link)}">Ver m&aacute;s</a>` : ''}
          </div>
        </div>
      `).join('');
      const dots = banners.map((_, i) => `<span class="hero-dot ${i === 0 ? 'active' : ''}" onclick="goHero(${i})"></span>`).join('');
      el.innerHTML = slides + `<div class="hero-dots">${dots}</div>`;
      heroIndex = 0;
      if (banners.length > 1) {
        clearInterval(heroInterval);
        heroInterval = setInterval(() => { goHero((heroIndex + 1) % banners.length); }, 5000);
      }
    }

    function goHero(idx) {
      const slides = document.querySelectorAll('.hero-slide');
      const dots = document.querySelectorAll('.hero-dot');
      slides.forEach((s, i) => s.classList.toggle('active', i === idx));
      dots.forEach((d, i) => d.classList.toggle('active', i === idx));
      heroIndex = idx;
    }

    // ===== CATEGORIES =====
    function renderCategories(cats, active) {
      const grid = document.getElementById('catGrid');
      const nav = document.getElementById('navDropdown');

      if (!cats || cats.length === 0) {
        grid.innerHTML = '';
        nav.innerHTML = '';
        return;
      }

      function getCatImage(catName) {
        const custom = allConfig.categoryImages || {};
        if (Object.prototype.hasOwnProperty.call(custom, catName) && custom[catName]) return custom[catName];
        const prod = allProducts.find(p => p.category === catName && p.image && p.image !== STOCK_IMAGES[catName]);
        if (prod) return prod.image;
        const first = allProducts.find(p => p.category === catName && p.image);
        if (first) return first.image;
        const fallbacks = {
          'General': 'https://picsum.photos/seed/producto/400/300',
          'Alimentos': 'https://picsum.photos/seed/alimentos/400/300',
          'Bebidas': 'https://picsum.photos/seed/bebidas/400/300',
          'Hogar': 'https://picsum.photos/seed/hogar/400/300',
        };
        return fallbacks[catName] || 'https://picsum.photos/seed/producto/400/300';
      }

      grid.innerHTML = cats.map(c => `
        <div class="cat-card ${active === c.name ? 'active' : ''}" onclick="filterByCategory(decodeURIComponent('${jsStr(c.name)}'))">
          <div class="cat-card-bg" style="background-image: url('${safeImg(getCatImage(c.name))}')"></div>
          <div class="cat-card-overlay"></div>
          <span class="cat-card-name">${esc(c.name)}</span>
        </div>
      `).join('');

      const label = document.getElementById('navDropdownLabel');
      if (active === '__ofertas__') label.textContent = '🔥 Ofertas';
      else if (active) label.textContent = active;
      else label.textContent = 'Categor\u00edas';

      nav.innerHTML =
        `<a class="${!active || active === '__ofertas__' ? 'active' : ''}" onclick="filterByCategory(''); closeNavDropdown()">Todos los productos</a>` +
        `<a class="${active === '__ofertas__' ? 'active' : ''} sep" onclick="filterByOffers(); closeNavDropdown()">🔥 Ofertas</a>` +
        cats.map(c => `<a class="${active === c.name ? 'active' : ''}" onclick="filterByCategory(decodeURIComponent('${jsStr(c.name)}')); closeNavDropdown()">${esc(c.name)}</a>`).join('');
    }

    // ===== PRODUCTS =====
    function renderProducts(prods, cat) {
      const el = document.getElementById('prodGrid');
      const title = document.getElementById('prodTitle');
      const label = cat || '';
      title.textContent = cat || 'Todos los productos';
      const maxHome = Number(allConfig.maxHomeProducts) || 0;
      const isHomeView = !cat && activeCategory === '' && !(document.getElementById('searchInput').value || '').trim();
      if (isHomeView && maxHome > 0 && prods && prods.length > maxHome) {
        prods = [...prods];
        for (let i = prods.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [prods[i], prods[j]] = [prods[j], prods[i]];
        }
        prods = prods.slice(0, maxHome);
      }
      if (!prods || prods.length === 0) {
        el.innerHTML = '<div class="empty-state">No hay productos disponibles en esta categor&iacute;a.</div>';
        return;
      }
      el.innerHTML = prods.map(p => {
        const hasStock = Number(p.price) > 0;
        const imgSrc = safeImg(getProductImg(p)) || STOCK_IMAGES['default'];
        return `
        <div class="prod-card">
          <div class="prod-img-wrap">
            <img class="prod-img" src="${esc(imgSrc)}" alt="${esc(p.name)}" loading="lazy" onerror="this.src='${esc(STOCK_IMAGES['default'])}'" />
            <div class="prod-badge">
              ${p.nuevo ? '<span class="badge-nuevo">Nuevo</span>' : ''}
              ${p.oferta ? '<span class="badge-oferta">Oferta</span>' : ''}
              ${!hasStock ? '<span class="badge-sinstock">Sin stock</span>' : ''}
            </div>
          </div>
          <div class="prod-body">
            <div class="prod-cat">${esc(p.category || '')}</div>
            <div class="prod-name">${esc(p.name)}</div>
            ${(p.description || p.webDesc) ? `<div class="prod-desc">${esc(p.description || p.webDesc || '')}</div>` : ''}
            <div class="prod-footer">
              ${!hasStock ? '<span class="prod-sinstock">Sin stock</span>' : (p.oferta && p.ofertaPrice ? `<span class="prod-price-old">$${Number(p.price).toLocaleString('es-AR')}</span><span class="prod-price-oferta">$${Number(p.ofertaPrice).toLocaleString('es-AR')}</span>` : `<span class="prod-price ${p.nuevo ? 'price-nuevo' : p.oferta ? 'price-oferta' : ''}">$${Number(p.price).toLocaleString('es-AR')}</span>`)}
            </div>
            ${hasStock ? `<button class="prod-add" onclick='addToCart(decodeURIComponent("${jsStr(p.id)}"))'>Agregar al carrito</button>` : '<button class="prod-agotado" disabled>Sin stock</button>'}
          </div>
        </div>
      `}).join('');
    }

    // ===== FILTER / SEARCH =====
    function filterByOffers() {
      activeCategory = '__ofertas__';
      renderCategories(allCategories, '__ofertas__');
      const filtered = allProducts.filter(p => p.nuevo || p.oferta);
      renderProducts(filtered, '');
      document.getElementById('prodTitle').textContent = '🔥 Ofertas';
      document.getElementById('prodTitle').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function filterByCategory(cat) {
      activeCategory = cat;
      renderCategories(allCategories, cat);
      const filtered = cat ? allProducts.filter(p => p.category === cat) : allProducts;
      renderProducts(filtered, cat);
      document.getElementById('prodTitle').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function handleSearch(val) {
      const q = val.toLowerCase().trim();
      const baseList = activeCategory === '__ofertas__'
        ? allProducts.filter(p => p.nuevo || p.oferta)
        : (activeCategory ? allProducts.filter(p => p.category === activeCategory) : allProducts);
      const filtered = q
        ? allProducts.filter(p => p.name.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q) || (p.category || '').toLowerCase().includes(q))
        : baseList;
      document.getElementById('prodTitle').textContent = q ? `Resultados para "${val}"` : (activeCategory === '__ofertas__' ? 'Ofertas' : activeCategory ? activeCategory : 'Todos los productos');
      renderProducts(filtered, '');
      document.getElementById('heroSlider').style.display = q ? 'none' : '';
      document.getElementById('searchClear').style.display = q ? 'block' : 'none';
    }

    function clearSearch() {
      document.getElementById('searchInput').value = '';
      document.getElementById('searchClear').style.display = 'none';
      document.getElementById('heroSlider').style.display = '';
      handleSearch('');
    }

    // ===== FOOTER =====
    function renderFooter(config) {
      if (!config) return;
      if (config.phone) document.getElementById('footerPhone').textContent = '\u260E ' + config.phone;
      if (config.email) document.getElementById('footerEmail').textContent = '\u2709 ' + config.email;
      if (config.hours) document.getElementById('footerHours').textContent = '\uD83D\uDD52 ' + config.hours;
      if (config.address) document.getElementById('footerAddress').textContent = '\uD83D\uDCCD ' + config.address;
      if (config.metaDescription) document.getElementById('footerDesc').textContent = config.metaDescription;

      const social = document.getElementById('footerSocial');
      const links = [];
      if (config.whatsapp) links.push({ href: safeUrl('https://wa.me/' + String(config.whatsapp).replace(/[^0-9]/g, '')), label: '<svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>', title: 'WhatsApp' });
      if (config.instagram) links.push({ href: safeUrl('https://instagram.com/' + String(config.instagram)), label: '<svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>', title: 'Instagram' });
      if (config.facebook) links.push({ href: safeUrl('https://facebook.com/' + String(config.facebook)), label: '<svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>', title: 'Facebook' });
      if (config.tiktok) links.push({ href: safeUrl('https://tiktok.com/@' + String(config.tiktok)), label: 'TK', title: 'TikTok' });
      if (config.youtube) links.push({ href: safeUrl('https://youtube.com/@' + String(config.youtube)), label: 'YT', title: 'YouTube' });
      if (config.twitter) links.push({ href: safeUrl('https://twitter.com/' + String(config.twitter)), label: 'X', title: 'Twitter' });
      if (config.linkedin) links.push({ href: safeUrl('https://linkedin.com/company/' + String(config.linkedin)), label: 'in', title: 'LinkedIn' });
      social.innerHTML = links.map(l => `<a href="${esc(l.href)}" target="_blank" rel="noopener" title="${esc(l.title)}">${l.label}</a>`).join('');
    }

    // ===== POPUP =====
    let popupDismissed = false;

    function showPopup(config) {
      if (popupDismissed) return;
      if (!config || !config.popupActive) return;
      const delay = (config.popupDelay || 3) * 1000;
      const duration = (config.popupDuration || 5) * 1000;
      const overlay = document.getElementById('popupOverlay');
      if (config.popupText) document.getElementById('popupText').textContent = config.popupText;
      if (config.popupImage) {
        const img = document.getElementById('popupImg');
        img.src = safeImg(config.popupImage.startsWith('data:') || config.popupImage.startsWith('http') ? config.popupImage : '/web/' + config.popupImage);
        img.style.display = 'block';
      }
      document.getElementById('popupTitle').textContent = config.companyName || 'Bienvenido';
      setTimeout(() => {
        overlay.classList.add('show');
        if (!config.popupAlways) {
          setTimeout(() => closePopup(), duration);
        }
      }, delay);
    }

    function closePopup() {
      document.getElementById('popupOverlay').classList.remove('show');
    }

    function dismissPopup() {
      popupDismissed = true;
      localStorage.setItem('mv_popup_dismissed', '1');
      closePopup();
    }

    document.getElementById('popupOverlay').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) closePopup();
    });

    // ===== NAV DROPDOWN =====
    function toggleNavDropdown() {
      document.getElementById('navDropdown').classList.toggle('open');
    }
    function closeNavDropdown() {
      document.getElementById('navDropdown').classList.remove('open');
    }
    document.addEventListener('click', (e) => {
      const btn = document.getElementById('navDropdownBtn');
      const dd = document.getElementById('navDropdown');
      if (btn && dd && !btn.contains(e.target) && !dd.contains(e.target)) {
        dd.classList.remove('open');
      }
    });

// ===== LOAD =====
    async function load() {
      let ok = false;
      try {
        const data = await loadFromSupabase();
        allProducts = data.products || [];
        allCategories = data.categories || [];
        allBanners = (data.config && data.config.banners) || [];
        allConfig = data.config || {};
        afterLoadFallback(); ok = true;
      } catch {}
      if (!ok) try {
        const r = await fetch(API_BASE + '/web-data');
        if (!r.ok) throw new Error('Error');
        const data = await r.json();
        allProducts = data.products || [];
        allCategories = data.categories || [];
        allBanners = (data.config && data.config.banners) || [];
        allConfig = data.config || {};
        afterLoadFallback(); ok = true;
      } catch {}
      if (!ok) try {
        const r = await fetch('data.json');
        if (!r.ok) throw new Error('Error');
        const data = await r.json();
        allProducts = data.products || [];
        allCategories = data.categories || [];
        allBanners = (data.config && data.config.banners) || [];
        allConfig = { ...(data.config || {}), supabaseUrl: data.supabaseUrl || '', supabaseKey: data.supabaseKey || '', adminPin: data.adminPin || '', whatsapp: data.whatsapp || '' };
        afterLoadFallback(); ok = true;
      } catch {}
      if (!ok) {
        document.getElementById('prodGrid').innerHTML = '<div class="empty-state">Error al cargar los datos.</div>';
      }
    }

    function afterLoadFallback() {
      document.title = allConfig.siteTitle || 'Malcriado de Vinos';
      renderHero(allBanners);
      renderCategories(allCategories, '');
      renderProducts(allProducts, '');
      renderFooter(allConfig);
      document.getElementById('offersBtn').style.display = allConfig.showOffersButton !== false ? '' : 'none';
      if (allConfig.whatsapp) {
        const num = allConfig.whatsapp.replace(/[^0-9]/g, '');
        const btn = document.getElementById('waBtn');
        if (btn) { btn.href = 'https://wa.me/' + num + '?text=Hola%21+Quiero+consultar+por+productos'; btn.style.display = 'flex'; }
      }
      const dismissed = localStorage.getItem('mv_popup_dismissed');
      if (dismissed !== '1') showPopup(allConfig);
    }

    load();
    retryPendingOrders();
    setInterval(() => {
      const pending = JSON.parse(localStorage.getItem('mv_pending_orders') || '[]');
      if (pending.length > 0) {
        retryPendingOrders();
      }
    }, 3000);
    setInterval(retryPendingOrders, 30000);

    // ===== CART =====
    let cart = JSON.parse(localStorage.getItem('mv_cart') || '[]');
    updateCartBadge();

    function saveCart() { localStorage.setItem('mv_cart', JSON.stringify(cart)); updateCartBadge(); }

    function updateCartBadge() {
      const badge = document.getElementById('cartBadge');
      const count = cart.reduce((s, i) => s + i.qty, 0);
      if (count > 0) { badge.textContent = count; badge.style.display = 'flex'; } else { badge.style.display = 'none'; }
    }

    function toggleCart() {
      const overlay = document.getElementById('cartOverlay');
      overlay.classList.toggle('open');
      if (overlay.classList.contains('open')) {
        document.getElementById('checkoutForm').classList.remove('open');
        document.getElementById('checkoutSuccess').classList.remove('open');
        document.getElementById('cartItems').style.display = '';
        document.getElementById('cartFooter').style.display = '';
        renderCart();
      }
      document.body.style.overflow = overlay.classList.contains('open') ? 'hidden' : '';
    }

    function closeCart() {
      document.getElementById('cartOverlay').classList.remove('open');
      document.getElementById('checkoutForm').classList.remove('open');
      document.getElementById('checkoutSuccess').classList.remove('open');
      document.getElementById('cartItems').style.display = '';
      document.getElementById('cartFooter').style.display = '';
      document.body.style.overflow = '';
    }

    function addToCart(productId) {
      const product = allProducts.find(p => p.id === productId);
      if (!product) return;
      if (!product.price || Number(product.price) === 0) { showToast(product.name + ' no tiene stock disponible', 'error'); return; }
      const existing = cart.find(i => i.id === product.id);
      if (existing) { existing.qty += 1; }
      else { cart.push({ id: product.id, name: product.name, price: product.price, category: product.category, image: getProductImg(product), qty: 1 }); }
      saveCart();
      renderCart();
      showToast(product.name + ' agregado', 'success');
    }

    function renderCart() {
      const el = document.getElementById('cartItems');
      const footer = document.getElementById('cartFooter');
      const totalEl = document.getElementById('cartTotal');
      const checkoutBtn = document.getElementById('cartCheckoutBtn');
      if (cart.length === 0) {
        el.innerHTML = '<div class="cart-empty">El carrito est\u00e1 vac\u00edo</div>';
        footer.style.display = 'none';
        return;
      }
      footer.style.display = '';
      const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
      totalEl.textContent = '$' + total.toLocaleString('es-AR');
      checkoutBtn.disabled = false;
      el.innerHTML = cart.map((item, idx) => `
        <div class="cart-item">
          <img class="cart-item-img" src="${esc(safeImg(item.image) || STOCK_IMAGES['default'])}" alt="${esc(item.name)}" onerror="this.src='${esc(STOCK_IMAGES['default'])}'" />
          <div class="cart-item-info">
            <div class="cart-item-name">${esc(item.name)}</div>
            <div class="cart-item-cat">${esc(item.category || '')}</div>
            <div class="cart-item-price">$${Number(item.price).toLocaleString('es-AR')}</div>
            <div class="cart-item-actions">
              <button class="cart-qty-btn" onclick="changeQty(${idx}, -1)">&minus;</button>
              <span class="cart-qty">${item.qty}</span>
              <button class="cart-qty-btn" onclick="changeQty(${idx}, 1)">+</button>
              <span class="cart-item-subtotal">$${(item.price * item.qty).toLocaleString('es-AR')}</span>
              <button class="cart-item-remove" onclick="removeFromCart(${idx})" title="Eliminar">&#10005;</button>
            </div>
          </div>
        </div>
      `).join('');
    }

    function changeQty(idx, delta) {
      cart[idx].qty += delta;
      if (cart[idx].qty <= 0) cart.splice(idx, 1);
      saveCart();
      if (cart.length === 0) { renderCart(); document.getElementById('checkoutForm').classList.remove('open'); return; }
      renderCart();
    }

    function removeFromCart(idx) {
      cart.splice(idx, 1);
      saveCart();
      if (cart.length === 0) { renderCart(); document.getElementById('checkoutForm').classList.remove('open'); return; }
      renderCart();
    }

    // ===== CHECKOUT =====
    function showCheckout() {
      if (cart.length === 0) return;
      document.getElementById('cartItems').style.display = 'none';
      document.getElementById('cartFooter').style.display = 'none';
      document.getElementById('checkoutSuccess').classList.remove('open');
      document.getElementById('checkoutForm').classList.add('open');
      const totalEl = document.getElementById('checkoutTotalDisplay');
      const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
    }

    function showCartItems() {
      document.getElementById('checkoutForm').classList.remove('open');
      document.getElementById('cartItems').style.display = '';
      document.getElementById('cartFooter').style.display = '';
    }

    async function postOrder(data) {
      // 1. Try same-origin API (works when served by local server)
      try {
        const r = await fetch(API_BASE + '/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
          signal: AbortSignal.timeout(8000)
        });
        if (r.ok) return r.json();
      } catch {}

      // 2. Try localhost API directly (works from GitHub Pages if local server is running)
      try {
        const r = await fetch('http://localhost:4050/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
          signal: AbortSignal.timeout(4000)
        });
        if (r.ok) return r.json();
      } catch {}

      // 3. Try Supabase cloud fallback
      const sbUrl = allConfig.supabaseUrl;
      const sbKey = allConfig.supabaseKey;
      if (sbUrl && sbKey) {
        try {
          const r = await fetch(sbUrl + '/rest/v1/orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': sbKey, 'Authorization': 'Bearer ' + sbKey, 'Prefer': 'return=representation' },
            body: JSON.stringify({ client_name: data.clientName, client_phone: data.clientPhone, items: JSON.stringify(data.items), total: data.total, notes: data.notes || '', delivery_type: data.deliveryType || '', status: 'nuevo', date: new Date().toISOString() }),
            signal: AbortSignal.timeout(8000)
          });
          if (r.ok) return { id: (await r.json())[0]?.id || 'sb-' + Date.now() };
        } catch {}
      }

      return null;
    }

    function pdfSafe(s) {
      return String(s == null ? '' : s).replace(/[^\x20-\x7E\xA0-\xFF\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u2026\u20AC\u2122\u00AB\u00BB]/g, '?');
    }

    function buildOrderPdf(data) {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ unit: 'pt', format: 'a4' });
      const W = doc.internal.pageSize.getWidth();
      const M = 40;
      let y = 46;

      const company = pdfSafe(allConfig.companyName || 'Malcriado de Vinos');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.setTextColor(20, 20, 20);
      doc.text(company, M, y);
      y += 16;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(110, 110, 110);
      const hd = [];
      if (allConfig.address) hd.push('Direcci\u00f3n: ' + pdfSafe(allConfig.address));
      if (allConfig.phone) hd.push('Tel\u00e9fono: ' + pdfSafe(allConfig.phone));
      if (allConfig.hours) hd.push('Horario: ' + pdfSafe(allConfig.hours));
      hd.forEach(l => { doc.text(l, M, y); y += 12; });
      y += 8;

      doc.setDrawColor(200, 200, 200);
      doc.line(M, y, W - M, y);
      y += 20;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(20, 20, 20);
      doc.text('COMPROBANTE DE PEDIDO', M, y);
      y += 18;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(60, 60, 60);
      const fecha = new Date().toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
      doc.text('Pedido: ' + pdfSafe(data.orderId || '—') + '      Fecha: ' + fecha, M, y);
      y += 20;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('Cliente', M, y);
      y += 13;
      doc.setFont('helvetica', 'normal');
      const cLines = ['Nombre: ' + pdfSafe(data.clientName || '')];
      if (data.clientPhone) cLines.push('Tel\u00e9fono: ' + pdfSafe(data.clientPhone));
      if (data.deliveryType) cLines.push('Entrega: ' + pdfSafe(data.deliveryType));
      if (data.notes) cLines.push('Notas: ' + pdfSafe(data.notes));
      cLines.forEach(l => { doc.text(l, M, y); y += 12; });
      y += 8;

      const colQty = W - M - 130;
      const colPrice = W - M - 70;
      doc.setFillColor(245, 245, 245);
      doc.rect(M, y, W - 2 * M, 18, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(30, 30, 30);
      doc.text('Producto', M, y + 12);
      doc.text('Cant.', colQty, y + 12);
      doc.text('Precio', colPrice, y + 12);
      doc.text('Subtotal', W - M, y + 12, { align: 'right' });
      y += 28;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(40, 40, 40);
      for (const item of data.items) {
        const sub = Number(item.price) * Number(item.quantity);
        doc.text(String(item.quantity), colQty, y);
        doc.text('$' + Number(item.price).toLocaleString('es-AR'), colPrice, y);
        doc.text('$' + sub.toLocaleString('es-AR'), W - M, y, { align: 'right' });
        const nameWrapped = doc.splitTextToSize(pdfSafe(item.name || ''), colQty - M - 12);
        doc.text(nameWrapped, M, y);
        y += Math.max(14, nameWrapped.length * 11 + 3);
      }

      y += 6;
      doc.setDrawColor(200, 200, 200);
      doc.line(M, y, W - M, y);
      y += 18;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(20, 20, 20);
      doc.text('Total: $' + Number(data.total).toLocaleString('es-AR'), W - M, y, { align: 'right' });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(140, 140, 140);
      doc.text('Gracias por tu compra. Present\u00e1 este comprobante al retirar o recibir tu pedido.', M, doc.internal.pageSize.getHeight() - 40);

      return doc.output('blob');
    }

    async function sendOrderViaWhatsApp(data) {
      try {
        const num = allConfig.whatsapp ? allConfig.whatsapp.replace(/[^0-9]/g, '') : '';
        if (!num) return;
        let msg = 'Nuevo pedido:\n\n';
        msg += 'Cliente: ' + data.clientName + '\n';
        msg += 'Tel\u00e9fono: ' + data.clientPhone + '\n';
        if (data.deliveryType) msg += 'Entrega: ' + data.deliveryType + '\n';
        if (data.notes) msg += 'Notas: ' + data.notes + '\n';
        msg += '\nProductos:\n';
        for (const i of data.items) {
          msg += '- ' + i.name + ' x' + i.quantity + ' = $' + (i.price * i.quantity).toLocaleString('es-AR') + '\n';
        }
        msg += '\nTotal: $' + data.total.toLocaleString('es-AR');

        let pdfBlob = null;
        const pdfName = 'pedido-' + String(data.orderId || Date.now()).replace(/[^a-zA-Z0-9\-_]/g, '') + '.pdf';
        try {
          if (window.jspdf) pdfBlob = buildOrderPdf(data);
        } catch (e) { console.error('PDF error:', e); }

        const file = pdfBlob ? new File([pdfBlob], pdfName, { type: 'application/pdf' }) : null;
        const ua = navigator.userAgent || '';
        const isMobileUA = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);

        if (file && isMobileUA && navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            const shared = await Promise.race([
              navigator.share({ files: [file], title: pdfName, text: msg }),
              new Promise(res => setTimeout(() => res('timeout'), 6e3))
            ]);
            if (shared !== 'timeout') return;
          } catch (e) {
            if (e && e.name === 'AbortError') return;
          }
        }

        if (pdfBlob) {
          const url = URL.createObjectURL(pdfBlob);
          const a = document.createElement('a');
          a.href = url;
          a.download = pdfName;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 3000);
        }
        window.open('https://wa.me/' + num + '?text=' + encodeURIComponent(msg), '_blank');
        if (pdfBlob) showToast('PDF descargado. Adjuntalo en el chat de WhatsApp que se abri\u00f3.', 'success');
      } catch (e) {
        console.error('WhatsApp error:', e);
      }
    }

    function savePendingOrder(data) {
      const pending = JSON.parse(localStorage.getItem('mv_pending_orders') || '[]');
      pending.push({ data, date: new Date().toISOString() });
      localStorage.setItem('mv_pending_orders', JSON.stringify(pending));
    }

    async function retryPendingOrders() {
      const pending = JSON.parse(localStorage.getItem('mv_pending_orders') || '[]');
      if (pending.length === 0) return;
      const kept = [];
      for (const p of pending) {
        const result = await postOrder(p.data).catch(() => null);
        if (!result) kept.push(p);
      }
      localStorage.setItem('mv_pending_orders', JSON.stringify(kept));
    }

    async function submitOrder() {
      const name = document.getElementById('checkoutName').value.trim();
      const phone = document.getElementById('checkoutPhone').value.trim();
      const deliveryType = document.getElementById('checkoutDelivery').value;
      const address = document.getElementById('checkoutAddress').value.trim();
      const notes = document.getElementById('checkoutNotes').value.trim();
      if (!name) { showToast('Ingres\u00e1 tu nombre', 'error'); return; }
      if (!phone) { showToast('Ingres\u00e1 tu tel\u00e9fono', 'error'); return; }

      const submitBtn = document.getElementById('checkoutSubmit');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Enviando...';

      try {
        const items = cart.map(i => ({ name: i.name, quantity: i.qty, price: i.price }));
        const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
        const body = {
          items, total, clientName: name, clientPhone: phone,
          notes: [notes, address ? 'Direcci\u00f3n: ' + address : ''].filter(Boolean).join(' | '),
          deliveryType
        };
        const order = await postOrder(body);
        sendOrderViaWhatsApp({ ...body, orderId: order ? order.id : null }).catch(() => {});
        cart = [];
        saveCart();
        document.getElementById('checkoutForm').classList.remove('open');
        const msg = order ? 'Pedido ' + order.id + ' recibido. Te contactaremos a la brevedad.' : 'Pedido recibido por WhatsApp. Te contactaremos a la brevedad.';
        document.getElementById('checkoutSuccessMsg').textContent = msg;
        document.getElementById('checkoutSuccess').classList.add('open');
        renderCart();
        showToast(order ? '\u00a1Pedido enviado!' : '\u00a1Pedido enviado por WhatsApp!', 'success');
        retryPendingOrders();
      } catch (e) {
        const items = cart.map(i => ({ name: i.name, quantity: i.qty, price: i.price }));
        const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
        savePendingOrder({
          items, total, clientName: name, clientPhone: phone,
          notes: [notes, address ? 'Direcci\u00f3n: ' + address : ''].filter(Boolean).join(' | '),
          deliveryType
        });
        cart = [];
        saveCart();
        document.getElementById('checkoutForm').classList.remove('open');
        document.getElementById('checkoutSuccessMsg').textContent = 'Tu pedido qued\u00f3 registrado. Se enviar\u00e1 autom\u00e1ticamente cuando el servidor est\u00e9 disponible.';
        document.getElementById('checkoutSuccess').classList.add('open');
        renderCart();
        showToast('Pedido guardado localmente', 'success');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Enviar pedido';
      }
    }

    document.getElementById('checkoutDelivery').addEventListener('change', function () {
      document.getElementById('checkoutAddressField').style.display = this.value === 'envio' ? '' : 'none';
    });

    // ===== TOAST =====
    function showToast(msg, type) {
      const container = document.getElementById('toastContainer');
      const el = document.createElement('div');
      el.className = 'toast' + (type ? ' ' + type : '');
      el.textContent = msg;
      container.appendChild(el);
      setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 300); }, 3000);
    }
  
