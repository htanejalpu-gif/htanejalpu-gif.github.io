/**
 * Play TV for Mac - Desktop Application Logic
 */

(function () {
  'use strict';

  // 1. Channels Data
  let allChannels = (window.PLAY_TV_CHANNELS || window.CHANNELS_DATA || []).filter(c => c && typeof c === 'object');
  let currentChannels = [...allChannels];
  let activeCategory = 'ALL';
  let activeSubCategory = 'ALL';
  let searchQuery = '';
  let hlsInstance = null;

  // Channel Object Normalizer
  function normalizeChannel(c) {
    if (!c || typeof c !== 'object') return;
    c.streamUrl = c.streamUrl || c.primaryUrl || '';
    c.fallbackStreamUrl = c.fallbackStreamUrl || c.fallbackUrl || '';
    c.primaryUrl = c.primaryUrl || c.streamUrl || '';
    c.fallbackUrl = c.fallbackUrl || c.fallbackStreamUrl || '';
  }

  // Resolve Banner Image (local asset vs remote URL)
  function getBannerSrc(banner) {
    if (!banner) return 'assets/ic_app_icon.png';
    if (banner.startsWith('http://') || banner.startsWith('https://')) {
      return banner;
    }
    return `assets/${banner}.png`;
  }

  // 2. Playback State
  let currentPlayingIndex = -1;
  let currentPlayingChannel = null;
  let isUsingBackupStream = false;
  let controlsHideTimeout = null;
  let toastHideTimeout = null;

  // 3. DOM References
  const categoriesBar = document.getElementById('categoriesBar');
  const subcategoriesBar = document.getElementById('subcategoriesBar');
  const channelsGrid = document.getElementById('channelsGrid');
  const emptyState = document.getElementById('emptyState');
  const emptyStateText = document.getElementById('emptyStateText');
  const resetFilterBtn = document.getElementById('resetFilterBtn');
  const searchInput = document.getElementById('searchInput');
  const clearSearchBtn = document.getElementById('clearSearchBtn');
  const channelCounter = document.getElementById('channelCounter');
  const refreshBtn = document.getElementById('refreshBtn');

  // Player DOM
  const playerOverlay = document.getElementById('playerOverlay');
  const playerTopbar = document.getElementById('playerTopbar');
  const playerControls = document.getElementById('playerControls');
  const videoPlayer = document.getElementById('videoPlayer');
  const playerLoader = document.getElementById('playerLoader');
  const playerLoaderText = document.getElementById('playerLoaderText');
  const playerToast = document.getElementById('playerToast');
  const playbackFlash = document.getElementById('playbackFlash');
  const closePlayerBtn = document.getElementById('closePlayerBtn');
  const playerChannelLogo = document.getElementById('playerChannelLogo');
  const playerChannelName = document.getElementById('playerChannelName');
  const playerChannelCat = document.getElementById('playerChannelCat');
  const playerChannelDesc = document.getElementById('playerChannelDesc');
  const streamSwitcherBtn = document.getElementById('streamSwitcherBtn');
  const streamSourceLabel = document.getElementById('streamSourceLabel');
  const streamSourceDot = streamSwitcherBtn ? streamSwitcherBtn.querySelector('.stream-source-dot') : null;
  const playPauseBtn = document.getElementById('playPauseBtn');
  const playIcon = document.getElementById('playIcon');
  const pauseIcon = document.getElementById('pauseIcon');
  const volumeBtn = document.getElementById('volumeBtn');
  const volHighIcon = document.getElementById('volHighIcon');
  const volMuteIcon = document.getElementById('volMuteIcon');
  const volumeSlider = document.getElementById('volumeSlider');
  const prevChannelBtn = document.getElementById('prevChannelBtn');
  const nextChannelBtn = document.getElementById('nextChannelBtn');
  const pipBtn = document.getElementById('pipBtn');
  const fullscreenBtn = document.getElementById('fullscreenBtn');
  const enterFsIcon = document.getElementById('enterFsIcon');
  const exitFsIcon = document.getElementById('exitFsIcon');
  const toggleDrawerBtn = document.getElementById('toggleDrawerBtn');
  const channelDrawer = document.getElementById('channelDrawer');
  const closeDrawerBtn = document.getElementById('closeDrawerBtn');
  const drawerSearchInput = document.getElementById('drawerSearchInput');
  const drawerList = document.getElementById('drawerList');

  // Defined Category Ordering
  const CATEGORY_ORDER = [
    'ALL',
    'NEWS',
    'SPORTS',
    'INFOTAINMENT',
    'MOVIES',
    'COMEDY',
    'MUSIC',
    'DEVOTIONAL',
    'ENTERTAINMENT',
    'PUNJABI',
    'KIDS',
    'PAKISTAN'
  ];

  // Initialize
  function init() {
    if (allChannels.length === 0 && (window.PLAY_TV_CHANNELS || window.CHANNELS_DATA)) {
      allChannels = (window.PLAY_TV_CHANNELS || window.CHANNELS_DATA || []).filter(c => c && typeof c === 'object');
    }
    allChannels.forEach(normalizeChannel);
    currentChannels = [...allChannels];
    renderCategoryPills();
    renderChannels();
    setupEventListeners();
    setupKeyboardShortcuts();
    setupWindowDragHandler();
    setupFloatWindow();
    setupScreenSwipe();
    restoreVolume();

    // Live OTA Sync from Firebase Realtime Database
    if (window.fetch) {
      fetch('https://playtv-ba8df-default-rtdb.firebaseio.com/channels.json')
        .then(r => r.json())
        .then(data => {
          if (Array.isArray(data) && data.length > 0) {
            allChannels = data.filter(c => c && typeof c === 'object');
            allChannels.forEach(normalizeChannel);
            filterAndRenderChannels();
            renderCategoryPills();
            console.log('[PlayTV PWA] Synced ' + allChannels.length + ' channels live from Firebase RTDB');
          }
        })
        .catch(err => {
          console.warn('[PlayTV PWA] Firebase live sync fallback to local data:', err);
        });
    }
  }

  // Calculate counts per category
  function getCategoryCounts() {
    const counts = { ALL: allChannels.length };
    allChannels.forEach(c => {
      const cat = c.category || 'OTHER';
      counts[cat] = (counts[cat] || 0) + 1;
    });
    return counts;
  }

  // Render Top Category Navigation Pills
  function renderCategoryPills() {
    const counts = getCategoryCounts();
    categoriesBar.innerHTML = '';

    CATEGORY_ORDER.forEach(cat => {
      const pill = document.createElement('button');
      pill.className = `cat-pill ${cat === activeCategory ? 'active' : ''}`;
      const count = counts[cat] || 0;
      pill.innerHTML = `<span>${cat}</span><span class="pill-count">${count}</span>`;
      pill.addEventListener('click', () => {
        selectCategory(cat);
      });
      categoriesBar.appendChild(pill);
    });
  }

  // Render Pakistan Subcategory Pills
  // Render Subcategory Pills (for Pakistan and News)
  function renderSubCategoryPills() {
    if (activeCategory !== 'PAKISTAN' && activeCategory !== 'NEWS') {
      subcategoriesBar.style.display = 'none';
      return;
    }

    const catChannels = allChannels.filter(c => c.category === activeCategory);
    const subCounts = { ALL: catChannels.length };
    catChannels.forEach(c => {
      const sub = c.subCategory || 'OTHER';
      subCounts[sub] = (subCounts[sub] || 0) + 1;
    });

    const subOrder = activeCategory === 'NEWS'
      ? ['ALL', 'HINDI', 'ENGLISH', 'BUSINESS', 'REGIONAL']
      : ['ALL', 'NEWS', 'ENTERTAINMENT', 'SPORTS', 'REGIONAL', 'DEVOTIONAL', 'MOVIES', 'INFOTAINMENT', 'KIDS'];

    subcategoriesBar.innerHTML = '';
    subOrder.forEach(sub => {
      if (!subCounts[sub]) return;
      const pill = document.createElement('button');
      pill.className = `subcat-pill ${sub === activeSubCategory ? 'active' : ''}`;
      const label = sub === 'ALL'
        ? (activeCategory === 'NEWS' ? 'All News' : 'All Pakistan')
        : (sub.charAt(0) + sub.slice(1).toLowerCase());
      pill.textContent = `${label} (${subCounts[sub]})`;
      pill.addEventListener('click', () => {
        activeSubCategory = sub;
        renderSubCategoryPills();
        filterAndRenderChannels();
      });
      subcategoriesBar.appendChild(pill);
    });

    subcategoriesBar.style.display = 'flex';
  }

  // Select Category
  function selectCategory(cat) {
    activeCategory = cat;
    activeSubCategory = 'ALL';
    renderCategoryPills();
    renderSubCategoryPills();
    filterAndRenderChannels();
  }

  // Filter channels based on Category, Subcategory, and Search query
  function filterAndRenderChannels() {
    let filtered = allChannels;

    // Filter by Category
    if (activeCategory !== 'ALL') {
      filtered = filtered.filter(c => c.category === activeCategory);
    }

    // Filter by Subcategory if in Pakistan or News
    if ((activeCategory === 'PAKISTAN' || activeCategory === 'NEWS') && activeSubCategory !== 'ALL') {
      filtered = filtered.filter(c => c.subCategory === activeSubCategory);
    }

    // Filter by Search Query
    if (searchQuery.trim() !== '') {
      const q = searchQuery.trim().toLowerCase();
      filtered = filtered.filter(c => {
        const nameMatch = (c.name || '').toLowerCase().includes(q);
        const catMatch = (c.category || '').toLowerCase().includes(q);
        const subMatch = (c.subCategory || '').toLowerCase().includes(q);
        const descMatch = (c.description || '').toLowerCase().includes(q);
        return nameMatch || catMatch || subMatch || descMatch;
      });
    }

    currentChannels = filtered;
    renderChannels();
  }

  // Render Channel Cards
  function renderChannels() {
    channelsGrid.innerHTML = '';
    channelCounter.textContent = `${currentChannels.length} Channels`;

    if (currentChannels.length === 0) {
      channelsGrid.style.display = 'none';
      emptyState.style.display = 'flex';
      if (searchQuery) {
        emptyStateText.textContent = `No channels matching "${searchQuery}"`;
      } else {
        emptyStateText.textContent = `No channels found in this category`;
      }
      return;
    }

    channelsGrid.style.display = 'grid';
    emptyState.style.display = 'none';

    currentChannels.forEach((channel, index) => {
      const card = document.createElement('div');
      card.className = 'channel-card';
      card.tabIndex = 0;

      const bannerSrc = getBannerSrc(channel.banner);

      card.innerHTML = `
        <div class="card-banner-wrapper">
          <img class="card-banner-img" src="${bannerSrc}" alt="${channel.name}" loading="lazy" onerror="this.src='assets/ic_app_icon.png'">
          <div class="card-hover-overlay">
            <div class="card-play-icon">
              <svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
            </div>
          </div>
        </div>
        <div class="card-info">
          <span class="card-title">${channel.name}</span>
          <div class="card-meta">
            <span class="card-category-tag">${channel.subCategory ? channel.category + ' • ' + channel.subCategory : channel.category}</span>
            <span class="card-quality-badge">${channel.quality || '720p HD'}</span>
          </div>
        </div>
      `;

      card.addEventListener('click', () => {
        playChannel(channel, index);
      });

      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          playChannel(channel, index);
        }
      });

      channelsGrid.appendChild(card);
    });
  }

  // Play Channel
  function playChannel(channel, index) {
    currentPlayingChannel = channel;
    currentPlayingIndex = index;
    isUsingBackupStream = false;

    // Open Player Overlay
    playerOverlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    // Populate Meta
    playerChannelName.textContent = channel.name;
    playerChannelCat.textContent = channel.category;
    playerChannelDesc.textContent = `${channel.quality || '720p HD'} • ${channel.subCategory || channel.description || 'Live Stream'}`;
    playerChannelLogo.src = getBannerSrc(channel.banner);

    updateStreamSwitcherUI();
    const streamToPlay = channel.primaryUrl || channel.streamUrl;
    loadStream(streamToPlay);
    renderDrawerList();
    resetControlsTimer();
  }

  // Load Stream URL into Video Element (Native HLS on iOS + Hls.js fallback)
  function loadStream(url) {
    if (!url) {
      showToast('No stream URL available');
      return;
    }
    showLoader(true, isUsingBackupStream ? 'Connecting backup stream...' : 'Connecting live stream...');
    
    if (hlsInstance) {
      hlsInstance.destroy();
      hlsInstance = null;
    }

    videoPlayer.pause();

    // 1. Native HLS (iOS Safari / iPad / macOS Safari)
    if (videoPlayer.canPlayType('application/vnd.apple.mpegurl')) {
      videoPlayer.src = url;
      const playPromise = videoPlayer.play();
      if (playPromise !== undefined) {
        playPromise.then(() => {
          showLoader(false);
          updatePlayPauseUI(true);
        }).catch(err => {
          console.warn('Initial play auto-start issue:', err);
          showLoader(false);
          updatePlayPauseUI(false);
        });
      }
    } 
    // 2. Hls.js for Chrome / Firefox / Edge
    else if (window.Hls && Hls.isSupported()) {
      hlsInstance = new Hls({ enableWorker: true, lowLatencyMode: true });
      hlsInstance.loadSource(url);
      hlsInstance.attachMedia(videoPlayer);
      hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
        const p = videoPlayer.play();
        if (p !== undefined) {
          p.then(() => {
            showLoader(false);
            updatePlayPauseUI(true);
          }).catch(err => {
            console.warn(err);
            showLoader(false);
            updatePlayPauseUI(false);
          });
        }
      });
      hlsInstance.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              hlsInstance.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hlsInstance.recoverMediaError();
              break;
            default:
              hlsInstance.destroy();
              break;
          }
        }
      });
    } 
    // 3. Fallback direct src
    else {
      videoPlayer.src = url;
      const p = videoPlayer.play();
      if (p !== undefined) {
        p.then(() => {
          showLoader(false);
          updatePlayPauseUI(true);
        }).catch(err => {
          console.warn(err);
          showLoader(false);
          updatePlayPauseUI(false);
        });
      }
    }
  }

  // Switch between Primary & Backup Stream
  function switchStreamSource(forceBackup = null) {
    if (!currentPlayingChannel) return;

    if (forceBackup !== null) {
      isUsingBackupStream = forceBackup;
    } else {
      isUsingBackupStream = !isUsingBackupStream;
    }

    const targetUrl = isUsingBackupStream ? 
      (currentPlayingChannel.fallbackUrl || currentPlayingChannel.fallbackStreamUrl || currentPlayingChannel.primaryUrl || currentPlayingChannel.streamUrl) : 
      (currentPlayingChannel.primaryUrl || currentPlayingChannel.streamUrl);

    showToast(isUsingBackupStream ? 'Switched to Backup Stream' : 'Switched to Primary Stream');
    updateStreamSwitcherUI();
    loadStream(targetUrl);
  }

  // Update Stream Switcher UI
  function updateStreamSwitcherUI() {
    if (!currentPlayingChannel) return;

    const prim = currentPlayingChannel.primaryUrl || currentPlayingChannel.streamUrl;
    const fall = currentPlayingChannel.fallbackUrl || currentPlayingChannel.fallbackStreamUrl;
    const hasFallback = !!fall && fall !== prim;

    if (!hasFallback) {
      streamSwitcherBtn.style.opacity = '0.5';
      streamSwitcherBtn.style.cursor = 'default';
      streamSourceLabel.textContent = 'Single Stream';
      streamSourceDot.className = 'stream-source-dot';
      return;
    }

    streamSwitcherBtn.style.opacity = '1';
    streamSwitcherBtn.style.cursor = 'pointer';

    if (isUsingBackupStream) {
      streamSourceLabel.textContent = 'Backup Stream';
      streamSourceDot.className = 'stream-source-dot backup';
    } else {
      streamSourceLabel.textContent = 'Primary Stream';
      streamSourceDot.className = 'stream-source-dot';
    }
  }

  // Close Player
  function closePlayer() {
    videoPlayer.pause();
    videoPlayer.removeAttribute('src');
    videoPlayer.load();

    playerOverlay.style.display = 'none';
    document.body.style.overflow = 'overlay';
    channelDrawer.classList.remove('open');
    showLoader(false);

    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
  }

  // Play / Pause Toggle
  function togglePlayPause() {
    if (videoPlayer.paused) {
      videoPlayer.play();
      flashPlaybackIcon('play');
    } else {
      videoPlayer.pause();
      flashPlaybackIcon('pause');
    }
  }

  function updatePlayPauseUI(isPlaying) {
    if (isPlaying) {
      playIcon.style.display = 'none';
      pauseIcon.style.display = 'block';
    } else {
      playIcon.style.display = 'block';
      pauseIcon.style.display = 'none';
    }
  }

  function flashPlaybackIcon(type) {
    playbackFlash.innerHTML = type === 'play' 
      ? '<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>'
      : '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>';
    playbackFlash.classList.add('active');
    setTimeout(() => {
      playbackFlash.classList.remove('active');
    }, 450);
  }

  // Next / Prev Channel
  function playNextChannel() {
    if (currentChannels.length === 0) return;
    let nextIndex = (currentPlayingIndex + 1) % currentChannels.length;
    playChannel(currentChannels[nextIndex], nextIndex);
  }

  function playPrevChannel() {
    if (currentChannels.length === 0) return;
    let prevIndex = (currentPlayingIndex - 1 + currentChannels.length) % currentChannels.length;
    playChannel(currentChannels[prevIndex], prevIndex);
  }

  // Picture in Picture
  function togglePiP() {
    if (document.pictureInPictureElement) {
      document.exitPictureInPicture().catch(console.error);
    } else if (document.pictureInPictureEnabled && videoPlayer.requestPictureInPicture) {
      videoPlayer.requestPictureInPicture().catch(err => {
        showToast('PiP not available for this stream');
      });
    }
  }

  // Fullscreen
  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      playerOverlay.requestFullscreen().then(() => {
        enterFsIcon.style.display = 'none';
        exitFsIcon.style.display = 'block';
      }).catch(console.error);
    } else {
      document.exitFullscreen().then(() => {
        enterFsIcon.style.display = 'block';
        exitFsIcon.style.display = 'none';
      }).catch(console.error);
    }
  }

  // Volume
  function setVolume(val) {
    const v = Math.max(0, Math.min(1, val));
    videoPlayer.volume = v;
    videoPlayer.muted = (v === 0);
    volumeSlider.value = v;
    updateVolumeUI(v, videoPlayer.muted);
    localStorage.setItem('playtv_mac_volume', v);
  }

  function toggleMute() {
    if (videoPlayer.muted || videoPlayer.volume === 0) {
      videoPlayer.muted = false;
      const saved = parseFloat(localStorage.getItem('playtv_mac_volume') || '1');
      videoPlayer.volume = saved > 0 ? saved : 1;
      volumeSlider.value = videoPlayer.volume;
    } else {
      videoPlayer.muted = true;
      volumeSlider.value = 0;
    }
    updateVolumeUI(videoPlayer.volume, videoPlayer.muted);
  }

  function updateVolumeUI(vol, isMuted) {
    if (isMuted || vol === 0) {
      volHighIcon.style.display = 'none';
      volMuteIcon.style.display = 'block';
    } else {
      volHighIcon.style.display = 'block';
      volMuteIcon.style.display = 'none';
    }
  }

  function restoreVolume() {
    const saved = localStorage.getItem('playtv_mac_volume');
    if (saved !== null) {
      setVolume(parseFloat(saved));
    }
  }

  // Show Toast
  function showToast(msg) {
    playerToast.textContent = msg;
    playerToast.style.display = 'block';
    clearTimeout(toastHideTimeout);
    toastHideTimeout = setTimeout(() => {
      playerToast.style.display = 'none';
    }, 3200);
  }

  // Loader
  function showLoader(show, text = 'Loading stream...') {
    playerLoaderText.textContent = text;
    playerLoader.style.display = show ? 'flex' : 'none';
  }

  // Controls Auto-Hide
  function resetControlsTimer() {
    playerTopbar.classList.remove('hidden');
    playerControls.classList.remove('hidden');
    clearTimeout(controlsHideTimeout);

    if (playerOverlay.style.display === 'flex' && !videoPlayer.paused) {
      controlsHideTimeout = setTimeout(() => {
        if (!channelDrawer.classList.contains('open')) {
          playerTopbar.classList.add('hidden');
          playerControls.classList.add('hidden');
        }
      }, 3500);
    }
  }

  // Drawer List
  function renderDrawerList(filter = '') {
    drawerList.innerHTML = '';
    const q = filter.trim().toLowerCase();

    allChannels.forEach((ch, idx) => {
      if (q && !ch.name.toLowerCase().includes(q) && !ch.category.toLowerCase().includes(q)) {
        return;
      }

      const item = document.createElement('div');
      item.className = `drawer-item ${ch.name === (currentPlayingChannel && currentPlayingChannel.name) ? 'active' : ''}`;
      item.innerHTML = `
        <img class="drawer-item-thumb" src="${getBannerSrc(ch.banner)}" alt="" onerror="this.src='assets/ic_app_icon.png'">
        <div class="drawer-item-info">
          <div class="drawer-item-name">${ch.name}</div>
          <div class="drawer-item-cat">${ch.category} ${ch.subCategory ? '• ' + ch.subCategory : ''}</div>
        </div>
      `;

      item.addEventListener('click', () => {
        playChannel(ch, idx);
        channelDrawer.classList.remove('open');
      });

      drawerList.appendChild(item);
    });
  }

  // Setup Event Listeners
  function setupEventListeners() {
    // Search
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value;
      clearSearchBtn.style.display = searchQuery ? 'block' : 'none';
      filterAndRenderChannels();
    });

    clearSearchBtn.addEventListener('click', () => {
      searchInput.value = '';
      searchQuery = '';
      clearSearchBtn.style.display = 'none';
      filterAndRenderChannels();
      searchInput.focus();
    });

    resetFilterBtn.addEventListener('click', () => {
      searchInput.value = '';
      searchQuery = '';
      clearSearchBtn.style.display = 'none';
      selectCategory('ALL');
    });

    refreshBtn.addEventListener('click', () => {
      filterAndRenderChannels();
    });

    // Player events
    closePlayerBtn.addEventListener('click', closePlayer);
    playPauseBtn.addEventListener('click', togglePlayPause);
    prevChannelBtn.addEventListener('click', playPrevChannel);
    nextChannelBtn.addEventListener('click', playNextChannel);
    pipBtn.addEventListener('click', togglePiP);
    fullscreenBtn.addEventListener('click', toggleFullscreen);

    volumeBtn.addEventListener('click', toggleMute);
    volumeSlider.addEventListener('input', (e) => {
      setVolume(parseFloat(e.target.value));
    });

    streamSwitcherBtn.addEventListener('click', () => {
      switchStreamSource();
    });

    toggleDrawerBtn.addEventListener('click', () => {
      channelDrawer.classList.toggle('open');
      if (channelDrawer.classList.contains('open')) {
        drawerSearchInput.focus();
      }
    });

    closeDrawerBtn.addEventListener('click', () => {
      channelDrawer.classList.remove('open');
    });

    drawerSearchInput.addEventListener('input', (e) => {
      renderDrawerList(e.target.value);
    });

    // Auto-hide controls on mouse move
    playerOverlay.addEventListener('mousemove', resetControlsTimer);

    // Video Player events
    videoPlayer.addEventListener('playing', () => {
      showLoader(false);
      updatePlayPauseUI(true);
      resetControlsTimer();
    });

    videoPlayer.addEventListener('pause', () => {
      updatePlayPauseUI(false);
      playerTopbar.classList.remove('hidden');
      playerControls.classList.remove('hidden');
    });

    videoPlayer.addEventListener('waiting', () => {
      showLoader(true, 'Buffering...');
    });

    videoPlayer.addEventListener('canplay', () => {
      showLoader(false);
    });

    // Video error handling & automatic fallback logic
    videoPlayer.addEventListener('error', (e) => {
      console.warn('Video playback error encountered:', e);

      if (!isUsingBackupStream && currentPlayingChannel && currentPlayingChannel.fallbackStreamUrl) {
        showToast('Primary stream unavailable. Switching to Backup Stream...');
        setTimeout(() => {
          switchStreamSource(true);
        }, 800);
      } else {
        showLoader(true, 'Stream temporarily unavailable. Try another channel.');
        showToast('Stream error. Please try another channel.');
      }
    });

    // Fullscreen change detection
    document.addEventListener('fullscreenchange', () => {
      if (document.fullscreenElement) {
        enterFsIcon.style.display = 'none';
        exitFsIcon.style.display = 'block';
      } else {
        enterFsIcon.style.display = 'block';
        exitFsIcon.style.display = 'none';
      }
    });
  }

  // Keyboard Shortcuts
  function setupKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        if (e.key === 'Escape') {
          e.target.blur();
        }
        return;
      }

      // Quick search shortcut (/ or Cmd+F)
      if (e.key === '/' || (e.metaKey && e.key.toLowerCase() === 'f')) {
        e.preventDefault();
        searchInput.focus();
        searchInput.select();
        return;
      }

      // Float Window shortcut (Cmd+Shift+T or Cmd+T)
      if (e.metaKey && e.key.toLowerCase() === 't') {
        e.preventDefault();
        toggleFloatWindow();
        return;
      }

      // If Player is active
      if (playerOverlay.style.display === 'flex') {
        resetControlsTimer();

        switch (e.key) {
          case ' ':
          case 'k':
          case 'K':
            e.preventDefault();
            togglePlayPause();
            break;
          case 'Escape':
            e.preventDefault();
            if (channelDrawer.classList.contains('open')) {
              channelDrawer.classList.remove('open');
            } else {
              closePlayer();
            }
            break;
          case 'f':
          case 'F':
            e.preventDefault();
            toggleFullscreen();
            break;
          case 'p':
          case 'P':
            e.preventDefault();
            togglePiP();
            break;
          case 'm':
          case 'M':
            e.preventDefault();
            toggleMute();
            break;
          case 'ArrowLeft':
            e.preventDefault();
            playPrevChannel();
            break;
          case 'ArrowRight':
            e.preventDefault();
            playNextChannel();
            break;
          case 'ArrowUp':
            e.preventDefault();
            setVolume(videoPlayer.volume + 0.1);
            break;
          case 'ArrowDown':
            e.preventDefault();
            setVolume(videoPlayer.volume - 0.1);
            break;
          case 'c':
          case 'C':
            e.preventDefault();
            channelDrawer.classList.toggle('open');
            break;
          case 's':
          case 'S':
            e.preventDefault();
            switchStreamSource();
            break;
        }
      } else {
        // Grid navigation shortcuts
        if (e.key >= '1' && e.key <= '9') {
          const num = parseInt(e.key, 10);
          if (num < CATEGORY_ORDER.length) {
            selectCategory(CATEGORY_ORDER[num]);
          }
        }
      }
    });
  }

  // =========================================================================
  // Floating Window (Always on Top) & Window Dragging
  // =========================================================================
  let isFloatingOnTop = false;

  window.onFloatStateChanged = function(floating) {
    isFloatingOnTop = !!floating;
    updateFloatUI();
  };

  function toggleFloatWindow() {
    if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.toggleFloat) {
      window.webkit.messageHandlers.toggleFloat.postMessage('toggle');
    } else {
      isFloatingOnTop = !isFloatingOnTop;
      updateFloatUI();
    }
  }

  function updateFloatUI() {
    const floatBtn = document.getElementById('floatWindowBtn');
    const pFloatBtn = document.getElementById('playerFloatBtn');

    [floatBtn, pFloatBtn].forEach(btn => {
      if (!btn) return;
      if (isFloatingOnTop) {
        btn.classList.add('active-floating');
        btn.title = 'Unfloat Window (Normal Level) • ⌘⇧T';
      } else {
        btn.classList.remove('active-floating');
        btn.title = 'Float on Top (Always on Top) • ⌘⇧T';
      }
    });

    showToast(isFloatingOnTop ? '📌 Window Floating on Top (Always on Top)' : 'Window Restored to Normal Mode');
  }

  function setupFloatWindow() {
    const floatBtn = document.getElementById('floatWindowBtn');
    const pFloatBtn = document.getElementById('playerFloatBtn');

    if (floatBtn) {
      floatBtn.addEventListener('click', toggleFloatWindow);
    }
    if (pFloatBtn) {
      pFloatBtn.addEventListener('click', toggleFloatWindow);
    }

    // Query initial float state from Cocoa
    if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.getFloatState) {
      window.webkit.messageHandlers.getFloatState.postMessage('query');
    }
  }

  // Smooth Window Dragging for macOS WKWebView
  function setupWindowDragHandler() {
    const dragTargets = [
      document.querySelector('.window-titlebar'),
      document.querySelector('.app-header'),
      document.querySelector('.player-topbar')
    ];

    let isDraggingWindow = false;
    let lastScreenX = 0;
    let lastScreenY = 0;

    dragTargets.forEach(target => {
      if (!target) return;

      target.addEventListener('mousedown', (e) => {
        // Exclude interactive elements
        if (e.target.closest('button, input, select, textarea, a, .icon-btn, .search-container, .brand-icon, .player-channel-info, .stream-switcher-panel')) {
          return;
        }
        if (e.button !== 0) return; // Left mouse button only

        isDraggingWindow = true;
        lastScreenX = e.screenX;
        lastScreenY = e.screenY;

        // 1. Tell Cocoa to initiate native window drag
        if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.windowDrag) {
          window.webkit.messageHandlers.windowDrag.postMessage('start');
        }
      });

      target.addEventListener('dblclick', (e) => {
        if (e.target.closest('button, input, select, textarea, a, .icon-btn, .search-container, .brand-icon, .player-channel-info, .stream-switcher-panel')) {
          return;
        }
        if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.windowZoom) {
          window.webkit.messageHandlers.windowZoom.postMessage('zoom');
        }
      });
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDraggingWindow) return;
      const dx = e.screenX - lastScreenX;
      const dy = e.screenY - lastScreenY;
      lastScreenX = e.screenX;
      lastScreenY = e.screenY;

      if (dx !== 0 || dy !== 0) {
        if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.windowMove) {
          window.webkit.messageHandlers.windowMove.postMessage({ dx: dx, dy: dy });
        }
      }
    });

    window.addEventListener('mouseup', () => {
      isDraggingWindow = false;
    });
  }

  // =========================================================================
  // Swipe Left / Right to Change Channels (Trackpad & Touch / Mouse Drag)
  // =========================================================================
  function setupScreenSwipe() {
    const pOverlay = document.getElementById('playerOverlay');
    if (!pOverlay) return;

    let swipeStartX = 0;
    let swipeStartY = 0;
    let swipeStartTime = 0;
    let isSwiping = false;

    // Visual Indicator element
    let indicator = document.getElementById('swipeChannelIndicator');
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.id = 'swipeChannelIndicator';
      indicator.className = 'swipe-channel-indicator';
      pOverlay.appendChild(indicator);
    }

    function showSwipeFeedback(direction, channelName, category) {
      const isNext = direction === 'next';
      indicator.innerHTML = `
        <div class="swipe-indicator-card ${isNext ? 'next' : 'prev'}">
          <div class="swipe-arrow-circle">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
              ${isNext 
                ? '<polyline points="9 18 15 12 9 6"></polyline>' 
                : '<polyline points="15 18 9 12 15 6"></polyline>'}
            </svg>
          </div>
          <div class="swipe-details">
            <div class="swipe-tag">${isNext ? 'NEXT CHANNEL' : 'PREVIOUS CHANNEL'}</div>
            <div class="swipe-ch-name">${channelName}</div>
            <div class="swipe-ch-cat">${category || ''}</div>
          </div>
        </div>
      `;
      indicator.classList.remove('anim-prev', 'anim-next');
      void indicator.offsetWidth;
      indicator.classList.add(isNext ? 'anim-next' : 'anim-prev');
      indicator.classList.add('visible');

      clearTimeout(indicator._timer);
      indicator._timer = setTimeout(() => {
        indicator.classList.remove('visible');
      }, 1000);
    }

    function triggerNextChannel() {
      if (currentChannels.length === 0) return;
      const nextIdx = (currentPlayingIndex + 1) % currentChannels.length;
      const nextCh = currentChannels[nextIdx];
      showSwipeFeedback('next', nextCh.name, nextCh.category);
      playChannel(nextCh, nextIdx);
    }

    function triggerPrevChannel() {
      if (currentChannels.length === 0) return;
      const prevIdx = (currentPlayingIndex - 1 + currentChannels.length) % currentChannels.length;
      const prevCh = currentChannels[prevIdx];
      showSwipeFeedback('prev', prevCh.name, prevCh.category);
      playChannel(prevCh, prevIdx);
    }

    // 1. Mouse / Touch / Pointer Drag on Video Screen
    pOverlay.addEventListener('pointerdown', (e) => {
      // Ignore clicks on controls, drawer, buttons, topbar
      if (e.target.closest('button, input, select, textarea, .player-topbar, .player-controls, .channel-drawer, .stream-switcher-panel')) {
        return;
      }
      isSwiping = true;
      swipeStartX = e.clientX;
      swipeStartY = e.clientY;
      swipeStartTime = Date.now();
    }, { passive: true });

    pOverlay.addEventListener('pointerup', (e) => {
      if (!isSwiping) return;
      isSwiping = false;

      const dx = e.clientX - swipeStartX;
      const dy = e.clientY - swipeStartY;
      const dt = Date.now() - swipeStartTime;

      // Minimum swipe distance 50px, predominantly horizontal, within 800ms
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.3 && dt < 800) {
        if (dx < -50) {
          // Swiped Left -> Next Channel
          triggerNextChannel();
        } else if (dx > 50) {
          // Swiped Right -> Previous Channel
          triggerPrevChannel();
        }
      }
    }, { passive: true });

    pOverlay.addEventListener('pointercancel', () => {
      isSwiping = false;
    }, { passive: true });

    // 2. Trackpad Two-Finger Horizontal Swipe (Wheel events)
    let wheelDeltaAccum = 0;
    let isWheelCoolingDown = false;
    let wheelTimer = null;

    window.addEventListener('wheel', (e) => {
      if (pOverlay.style.display !== 'flex') return;
      if (e.target.closest('.channel-drawer, .drawer-list')) return;

      if (isWheelCoolingDown) return;

      // Horizontal swipe dominant
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && Math.abs(e.deltaX) > 6) {
        wheelDeltaAccum += e.deltaX;
        clearTimeout(wheelTimer);
        wheelTimer = setTimeout(() => {
          wheelDeltaAccum = 0;
        }, 250);

        const THRESHOLD = 55;
        if (Math.abs(wheelDeltaAccum) >= THRESHOLD) {
          isWheelCoolingDown = true;
          if (wheelDeltaAccum > 0) {
            triggerNextChannel();
          } else {
            triggerPrevChannel();
          }
          wheelDeltaAccum = 0;
          setTimeout(() => {
            isWheelCoolingDown = false;
          }, 650);
        }
      }
    }, { passive: true });
  }

  // Run on ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
