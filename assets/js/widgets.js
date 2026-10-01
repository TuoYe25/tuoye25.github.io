/**
 * Widgets Loader
 * - Weather: Open-Meteo current conditions + AQI, geolocation with city fallback
 * - Music: Bilibili favorites folder via official iframe embed (random order,
 *   auto-advance, starts on first user gesture)
 */
(function () {
  'use strict';

  /* ============================================================
   * Weather
   * ============================================================ */
  var WEATHER_CODES = {
    0: '晴', 1: '大部晴朗', 2: '局部多云', 3: '阴',
    45: '雾', 48: '雾凇',
    51: '小毛毛雨', 53: '毛毛雨', 55: '大毛毛雨',
    56: '冻毛毛雨', 57: '冻毛毛雨',
    61: '小雨', 63: '中雨', 65: '大雨',
    66: '冻雨', 67: '冻雨',
    71: '小雪', 73: '中雪', 75: '大雪', 77: '雪粒',
    80: '小阵雨', 81: '阵雨', 82: '大阵雨',
    85: '小阵雪', 86: '大阵雪',
    95: '雷暴', 96: '雷暴伴冰雹', 99: '雷暴伴强冰雹'
  };

  function weatherEmoji(code) {
    if (code <= 1) return '☀️';
    if (code === 2) return '🌤️';
    if (code === 3) return '☁️';
    if (code <= 48) return '🌫️';
    if (code <= 57) return '🌦️';
    if (code <= 67) return '🌧️';
    if (code <= 77) return '❄️';
    if (code <= 86) return '🌨️';
    return '⛈️';
  }

  function aqiLabel(aqi) {
    if (aqi == null || !isFinite(aqi)) return { text: 'AQI —', color: '#999' };
    if (aqi <= 50) return { text: 'AQI ' + Math.round(aqi) + ' 优', color: '#4caf50' };
    if (aqi <= 100) return { text: 'AQI ' + Math.round(aqi) + ' 良', color: '#ffc107' };
    if (aqi <= 150) return { text: 'AQI ' + Math.round(aqi) + ' 轻度', color: '#ff9800' };
    if (aqi <= 200) return { text: 'AQI ' + Math.round(aqi) + ' 中度', color: '#f44336' };
    if (aqi <= 300) return { text: 'AQI ' + Math.round(aqi) + ' 重度', color: '#9c27b0' };
    return { text: 'AQI ' + Math.round(aqi) + ' 严重', color: '#7e0023' };
  }

  function renderWeather(body, opts) {
    var cur = opts.current;
    var aqiVal = opts.aqi;
    var city = opts.city;
    var code = cur.weather_code;
    var desc = WEATHER_CODES[code] || '—';
    var temp = Math.round(cur.temperature_2m);
    var feel = Math.round(cur.apparent_temperature);
    var humidity = Math.round(cur.relative_humidity_2m);
    var wind = Math.round(cur.wind_speed_10m);
    var aqi = aqiLabel(aqiVal);

    body.innerHTML =
      '<div class="weather-main">' +
        '<span class="weather-emoji">' + weatherEmoji(code) + '</span>' +
        '<span class="weather-temp">' + temp + '°</span>' +
        '<div class="weather-desc">' +
          desc + ' · 体感 ' + feel + '°' +
          '<div class="weather-city">📍 ' + city + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="weather-chips">' +
        '<span class="weather-chip">💧 湿度 ' + humidity + '%</span>' +
        '<span class="weather-chip">🌬️ 风速 ' + wind + ' km/h</span>' +
        '<span class="weather-chip" style="border-color:' + aqi.color + '55;color:' + aqi.color + ';">' + aqi.text + '</span>' +
      '</div>';
  }

  function fetchWeatherByCoords(lat, lon, city, body) {
    var forecastUrl = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon +
      '&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m' +
      '&timezone=auto';
    var airUrl = 'https://air-quality-api.open-meteo.com/v1/air-quality?latitude=' + lat + '&longitude=' + lon +
      '&current=us_aqi&timezone=auto';

    Promise.all([
      fetch(forecastUrl).then(function (r) { return r.json(); }),
      fetch(airUrl).then(function (r) { return r.json(); }).catch(function () { return null; })
    ]).then(function (results) {
      var w = results[0];
      var air = results[1];
      if (!w || !w.current) throw new Error('weather data error');
      var aqiVal = air && air.current && typeof air.current.us_aqi === 'number' ? air.current.us_aqi : null;
      renderWeather(body, { current: w.current, aqi: aqiVal, city: city });
    }).catch(function () {
      body.innerHTML = '<div class="weather-error">天气数据获取失败</div>';
    });
  }

  function reverseGeocode(lat, lon, cb) {
    fetch('https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=' + lat +
      '&longitude=' + lon + '&localityLanguage=zh')
      .then(function (r) { return r.json(); })
      .then(function (d) {
        cb(d.city || d.locality || d.principalSubdivision || '当前位置');
      })
      .catch(function () { cb('当前位置'); });
  }

  function loadWeather(fallbackCity) {
    var body = document.getElementById('weather-body');
    var locateBtn = document.getElementById('weather-locate');
    if (!body) return;

    var geoBusy = false;

    function useFallbackCity() {
      body.innerHTML = '<div class="weather-loading">定位不可用，加载' + fallbackCity + '天气…</div>';
      fetch('https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(fallbackCity) +
        '&count=1&language=zh')
        .then(function (r) { return r.json(); })
        .then(function (geo) {
          if (!geo.results || !geo.results.length) throw new Error('city not found');
          var loc = geo.results[0];
          fetchWeatherByCoords(loc.latitude, loc.longitude, loc.name || fallbackCity, body);
        })
        .catch(function () {
          body.innerHTML = '<div class="weather-error">天气数据获取失败</div>';
        });
    }

    function useGeolocation() {
      if (geoBusy || !navigator.geolocation) {
        if (!navigator.geolocation) useFallbackCity();
        return;
      }
      geoBusy = true;
      body.innerHTML = '<div class="weather-loading">正在定位…</div>';
      navigator.geolocation.getCurrentPosition(
        function (pos) {
          geoBusy = false;
          reverseGeocode(pos.coords.latitude, pos.coords.longitude, function (city) {
            fetchWeatherByCoords(pos.coords.latitude, pos.coords.longitude, city, body);
          });
        },
        function () {
          geoBusy = false;
          useFallbackCity();
        },
        { enableHighAccuracy: false, timeout: 6000, maximumAge: 300000 }
      );
    }

    if (locateBtn) {
      locateBtn.addEventListener('click', useGeolocation);
    }

    // Auto-try geolocation on load; denied/timeout/unavailable falls back automatically
    useGeolocation();
  }

  /* ============================================================
   * Music (Bilibili favorites -> official iframe embed)
   * Random order; auto-advance by known track duration (the current
   * Bilibili embed does not reliably post events to the parent page).
   * ============================================================ */
  function shuffleArray(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function loadBiliSongs(cb) {
    if (window.BILIBILI_SONGS && window.BILIBILI_SONGS.songs && window.BILIBILI_SONGS.songs.length) {
      cb(window.BILIBILI_SONGS.songs);
      return;
    }
    var s = document.createElement('script');
    s.src = 'assets/json/bilibili.js?t=' + Date.now();
    s.onload = function () {
      cb((window.BILIBILI_SONGS && window.BILIBILI_SONGS.songs) || []);
    };
    s.onerror = function () { cb([]); };
    document.body.appendChild(s);
  }

  function initBiliPlayer() {
    var MUSIC_KEY = 'bili-music-on';

    var fab = document.getElementById('music-fab');
    var panel = document.getElementById('music-panel');
    var frame = document.getElementById('bili-frame');
    var coverEl = document.getElementById('bili-cover');
    var titleEl = document.getElementById('bili-title');
    var artistEl = document.getElementById('bili-artist');
    var linkEl = document.getElementById('bili-link');
    var prevBtn = document.getElementById('bili-prev');
    var nextBtn = document.getElementById('bili-next');
    var stopBtn = document.getElementById('bili-stop');
    if (!fab || !panel || !frame) return;

    var songs = [];
    var order = [];
    var pos = 0;
    var endTimer = null;
    var created = false;
    var playing = false;
    var gestureArmed = false;

    function curSong() { return songs[order[pos]]; }

    function setPlayingUI(on) {
      playing = on;
      if (on) fab.classList.add('is-playing');
      else fab.classList.remove('is-playing');
      if (stopBtn) {
        stopBtn.textContent = on ? '⏹' : '▶';
        stopBtn.title = on ? '停止' : '从头播放';
      }
    }

    function clearEndTimer() {
      if (endTimer) { clearTimeout(endTimer); endTimer = null; }
    }

    function scheduleEnd(song) {
      clearEndTimer();
      // small grace period for the player's end screen; guard minimum
      var ms = Math.max(5000, ((Number(song.duration) || 0) + 2) * 1000);
      endTimer = setTimeout(function () { playAt(pos + 1); }, ms);
    }

    function renderMeta(song) {
      if (coverEl) coverEl.src = song.cover || '';
      if (coverEl) coverEl.style.visibility = song.cover ? 'visible' : 'hidden';
      if (titleEl) titleEl.textContent = song.title || '未知曲目';
      if (artistEl) artistEl.textContent = song.artist || 'bilibili';
      if (linkEl) linkEl.href = 'https://www.bilibili.com/video/' + song.bvid;
    }

    function playAt(newPos) {
      if (!songs.length) return;
      if (newPos < 0) newPos = order.length - 1;
      if (newPos >= order.length) {
        // looped a full round -> reshuffle for variety
        order = shuffleArray(songs.map(function (_, i) { return i; }));
        pos = 0;
      } else {
        pos = newPos;
      }
      var song = curSong();
      renderMeta(song);
      frame.src = 'https://player.bilibili.com/player.html?bvid=' + encodeURIComponent(song.bvid) +
        '&autoplay=1&danmaku=0&high_quality=1';
      setPlayingUI(true);
      try { localStorage.setItem(MUSIC_KEY, '1'); } catch (e) {}
      scheduleEnd(song);
    }

    function stop() {
      clearEndTimer();
      frame.src = 'about:blank';
      setPlayingUI(false);
      try { localStorage.setItem(MUSIC_KEY, '0'); } catch (e) {}
    }

    function showEmpty() {
      if (titleEl) titleEl.textContent = '歌单为空';
      if (artistEl) artistEl.textContent = '请先在 B 站收藏夹添加视频';
      frame.src = 'about:blank';
    }

    function createPlayer(autoplay) {
      created = true;
      loadBiliSongs(function (list) {
        songs = list;
        if (!songs.length) { showEmpty(); setPlayingUI(false); return; }
        order = shuffleArray(songs.map(function (_, i) { return i; }));
        pos = Math.floor(Math.random() * order.length);
        if (autoplay) playAt(pos);
        else {
          var song = curSong();
          renderMeta(song);
          frame.src = 'https://player.bilibili.com/player.html?bvid=' + encodeURIComponent(song.bvid) +
            '&autoplay=0&danmaku=0';
          setPlayingUI(false);
        }
      });
    }

    // Best-effort: some embed versions post end events — honor them if present
    window.addEventListener('message', function (e) {
      if (!created || !playing) return;
      var host = String(e.origin || '').replace(/^https?:\/\//, '');
      if (!/(^|\.)bilibili\.com$/.test(host)) return;
      var str = typeof e.data === 'string' ? e.data : '';
      try { if (!str) str = JSON.stringify(e.data); } catch (err) { str = ''; }
      if (/PlayEnd|playerEnd|videoEnd|ended/i.test(str)) {
        playAt(pos + 1);
      }
    });

    fab.addEventListener('click', function () {
      if (!created) {
        createPlayer(true);
        panel.classList.add('show');
        return;
      }
      panel.classList.toggle('show');
    });

    if (prevBtn) prevBtn.addEventListener('click', function () {
      if (songs.length) playAt(pos - 1);
    });
    if (nextBtn) nextBtn.addEventListener('click', function () {
      if (songs.length) playAt(pos + 1);
    });
    if (stopBtn) stopBtn.addEventListener('click', function () {
      // toggle: stop current track, or replay the current track from the start
      if (playing) stop();
      else if (songs.length) playAt(pos);
    });

    // Browsers block autoplay before first interaction: start on first gesture
    function armGestureAutostart() {
      if (gestureArmed) return;
      gestureArmed = true;

      var saved = null;
      try { saved = localStorage.getItem(MUSIC_KEY); } catch (e) {}
      if (saved === '0') return;

      function onFirstGesture() {
        document.removeEventListener('pointerdown', onFirstGesture, true);
        document.removeEventListener('touchstart', onFirstGesture, true);
        document.removeEventListener('click', onFirstGesture, true);
        document.removeEventListener('keydown', onFirstGesture, true);
        if (!created) createPlayer(true);
      }
      // capture phase: fires even if page internals stop propagation
      document.addEventListener('pointerdown', onFirstGesture, true);
      document.addEventListener('touchstart', onFirstGesture, true);
      document.addEventListener('click', onFirstGesture, true);
      document.addEventListener('keydown', onFirstGesture, true);
    }

    armGestureAutostart();
  }

  /* ============================================================
   * Init
   * ============================================================ */
  function init() {
    var fallbackCity = document.body.getAttribute('data-weather-city') || 'Shanghai';
    loadWeather(fallbackCity);
    initBiliPlayer();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
