// ==UserScript==
// @name        夸克网盘智能重命名
// @namespace   https://github.com/Ryziii/quark-drive-rename
// @version     1.0.0
// @author      Ryziii
// @description 夸克网盘批量重命名工具，支持 TMDB 匹配剧集、AI 智能提取剧名、单文件夹快速重命名
// @license     MIT
// @homepage    https://github.com/Ryziii/quark-drive-rename
// @homepageURL https://github.com/Ryziii/quark-drive-rename
// @supportURL  https://github.com/Ryziii/quark-drive-rename/issues
// @match       https://pan.quark.cn/*
// @grant       GM_setValue
// @grant       GM_getValue
// @grant       GM_registerMenuCommand
// @grant       GM_addStyle
// @grant       GM_xmlhttpRequest
// ==/UserScript==

(function () {
  "use strict";

  const TMDB_API_KEY = "tmdb_api_key";
  const TMDB_BASE = "https://api.themoviedb.org/3";
  var notifyContainer = null;
  var apiCache = JSON.parse(GM_getValue("tmdb_cache", "{}"));
  var aiTitleCache = JSON.parse(GM_getValue("ai_title_cache", "{}"));
  var requestUiReload = null;
  var uiVisible = false;

  function getApiKey() {
    return GM_getValue(TMDB_API_KEY, "");
  }
  function setApiKey(key) {
    GM_setValue(TMDB_API_KEY, key);
  }

  function log() {
    console.log("[云盘重命名TMDB]", ...arguments);
  }
  function err() {
    console.error("[云盘重命名TMDB]", ...arguments);
  }

  var notifyQueue = [];
  var notifyTimer = null;

  function ensureNotifyContainer() {
    if (!notifyContainer || !document.body.contains(notifyContainer)) {
      notifyContainer = document.createElement("div");
      notifyContainer.id = "tmdb-notify-container";
      notifyContainer.style.cssText =
        "position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:999999;" +
        "display:flex;flex-direction:column;align-items:center;gap:6px;pointer-events:none;";
      notifyContainer.addEventListener("mousedown", function (e) {
        e.stopPropagation();
      });
      document.body.appendChild(notifyContainer);
    }
    return notifyContainer;
  }

  function notify(msg, type = "info") {
    notifyQueue.push({ msg: msg, type: type });
    if (!notifyTimer) processNotifyQueue();
  }

  function processNotifyQueue() {
    var mainVisible = uiVisible;
    var folderVisible = !!document.getElementById("folder-rename-dialog");
    if (!mainVisible && !folderVisible) {
      notifyQueue = [];
      notifyTimer = null;
      return;
    }
    if (!notifyQueue.length) {
      notifyTimer = null;
      return;
    }
    var item = notifyQueue.shift();
    showOneNotify(item.msg, item.type);
    notifyTimer = setTimeout(processNotifyQueue, 1000);
  }

  function showOneNotify(msg, type) {
    ensureNotifyContainer();
    var el = document.createElement("div");
    el.textContent = msg;
    el.style.cssText =
      "padding:10px 20px;border-radius:6px;font-size:14px;box-shadow:0 2px 12px rgba(0,0,0,.2);" +
      "transition:opacity .3s;pointer-events:auto;max-width:600px;text-align:center;";
    if (type === "error") {
      el.style.background = "#fee";
      el.style.color = "#c00";
      el.style.border = "1px solid #fcc";
    } else if (type === "success") {
      el.style.background = "#efe";
      el.style.color = "#060";
      el.style.border = "1px solid #cfc";
    } else {
      el.style.background = "#eef";
      el.style.color = "#006";
      el.style.border = "1px solid #ccf";
    }
    notifyContainer.appendChild(el);
    setTimeout(function () {
      el.style.opacity = "0";
      setTimeout(function () {
        if (el.parentNode) el.parentNode.removeChild(el);
      }, 300);
    }, 3500);
  }

  // 自定义确认框
  function confirmBox(msg) {
    return new Promise(function (resolve) {
      var overlay = document.createElement("div");
      overlay.style.cssText =
        "position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:999999;display:flex;align-items:center;justify-content:center;";
      var box = document.createElement("div");
      box.style.cssText =
        "background:#fff;border-radius:8px;padding:20px 24px;min-width:280px;max-width:360px;box-shadow:0 4px 20px rgba(0,0,0,.3);font-family:system-ui,sans-serif;";
      box.innerHTML =
        '<p style="margin:0 0 16px;font-size:15px;color:#333;line-height:1.5;">' +
        msg +
        "</p>" +
        '<div style="display:flex;gap:12px;"><button id="confirm-ok" style="flex:1;padding:10px;background:#4a90e2;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px;">确认</button>' +
        '<button id="confirm-cancel" style="flex:1;padding:10px;background:#eee;color:#333;border:none;border-radius:6px;cursor:pointer;font-size:14px;">取消</button></div>';
      overlay.appendChild(box);
      document.body.appendChild(overlay);
      overlay.addEventListener("mousedown", function (e) {
        e.stopPropagation();
      });
      box.querySelector("#confirm-ok").onclick = function () {
        overlay.remove();
        resolve(true);
      };
      box.querySelector("#confirm-cancel").onclick = function () {
        overlay.remove();
        resolve(false);
      };
      overlay.onclick = function (e) {
        if (e.target === overlay) {
          overlay.remove();
          resolve(false);
        }
      };
    });
  }

  // 注册菜单
  GM_registerMenuCommand("TMDB 设置", function () {
    var key = prompt("请输入TMDB API Key:", getApiKey() || "");
    if (key !== null) {
      setApiKey(key.trim());
      notify("API Key已保存: " + (key ? "已设置" : "已清除"), "success");
    }
  });

  GM_registerMenuCommand("AI 配置", function () {
    showAIConfigDialog();
  });
  function showAIConfigDialog() {
    function esc(s) {
      return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }

    var cfg = getAIConfig();
    var overlay = document.createElement("div");
    overlay.style.cssText =
      "position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:999999;display:flex;align-items:center;justify-content:center;";
    var box = document.createElement("div");
    box.style.cssText =
      "background:#fff;border-radius:10px;padding:20px 24px;min-width:340px;max-width:400px;box-shadow:0 4px 20px rgba(0,0,0,.3);font-family:system-ui,sans-serif;";
    box.innerHTML = `
      <h3 style="margin:0 0 16px;font-size:16px;">AI 配置（OpenAI 兼容接口）</h3>
      <label style="font-size:13px;color:#555;display:block;margin-bottom:4px;">API Key</label>
      <input id="ai-cfg-key" type="text" placeholder="sk-..." value="${esc(cfg.apiKey)}" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;margin-bottom:12px;">
      <label style="font-size:13px;color:#555;display:block;margin-bottom:4px;">Base URL</label>
      <input id="ai-cfg-url" type="text" placeholder="https://api.openai.com/v1" value="${esc(cfg.baseURL)}" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;margin-bottom:12px;">
      <label style="font-size:13px;color:#555;display:block;margin-bottom:4px;">模型名称</label>
      <input id="ai-cfg-model" type="text" placeholder="gpt-3.5-turbo" value="${esc(cfg.model)}" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;margin-bottom:16px;">
      <label style="font-size:13px;color:#555;display:block;margin-bottom:4px;">
      OpenRouter Provider（仅限 OpenRouter，逗号分隔）
      </label>
      <input id="ai-cfg-provider" type="text"
        placeholder="例如 deepinfra, together"
        value="${esc(cfg.provider)}"
        style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;margin-bottom:12px;">
      <div style="display:flex;gap:10px;">
        <button id="ai-save" style="flex:1;padding:10px;background:#4a90e2;color:#fff;border:none;border-radius:6px;cursor:pointer;">保存</button>
        <button id="ai-cancel" style="flex:1;padding:10px;background:#eee;border:none;border-radius:6px;cursor:pointer;">取消</button>
      </div>
      <div style="display:flex;gap:10px; margin-top:10px;">
        <button id="ai-clear-cache" style="flex:1;padding:10px;background:#e74c3c;color:#fff;border:none;border-radius:6px;cursor:pointer;">清空所有 AI 缓存</button>
      </div>
        `;
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    box.querySelector("#ai-save").onclick = function () {
      var key = document.getElementById("ai-cfg-key").value.trim();
      var url = document.getElementById("ai-cfg-url").value.trim();
      var model = document.getElementById("ai-cfg-model").value.trim();
      var provider = document.getElementById("ai-cfg-provider").value.trim();
      setAIConfig(key, url, model, provider);
      overlay.remove();
      notify("AI 配置已保存", "success");
    };
    box.querySelector("#ai-cancel").onclick = function () {
      overlay.remove();
    };
    box.querySelector("#ai-clear-cache").onclick = function () {
      aiTitleCache = {};
      GM_setValue("ai_title_cache", "{}");
      notify("AI 缓存已清空", "success");
    };
    overlay.onclick = function (e) {
      if (e.target === overlay) overlay.remove();
    };
  }

  function getAIConfig() {
    return {
      apiKey: GM_getValue("ai_api_key", ""),
      baseURL: GM_getValue("ai_base_url", "https://api.groq.com/openai/v1"),
      model: GM_getValue("ai_model", "llama-3.1-8b-instant"),
      provider: GM_getValue("ai_provider", ""),
    };
  }

  function setAIConfig(key, url, model, provider) {
    GM_setValue("ai_api_key", key);
    GM_setValue("ai_base_url", url);
    GM_setValue("ai_model", model);
    GM_setValue("ai_provider", provider || "");
  }

  console.log("[云盘重命名TMDB] 脚本加载");

  // 获取文件列表（仅夸克）
  function getFileList(callback) {
    var fid = getParentId();
    log("加载目录ID:", fid);
    getFilesQuark(fid, callback);
  }

  function getParentId() {
    var hash = location.hash;
    if (hash.includes("#/list/all")) {
      var parts = hash.replace("#/list/all", "").split("/").filter(Boolean);
      if (parts.length > 0) {
        return parts[parts.length - 1].replace(/-.*$/, "");
      }
    }
    return "0";
  }

  function getFilesQuark(parentId, callback) {
    var baseUrl =
      "https://drive-pc.quark.cn/1/clouddrive/file/sort?pr=ucpro&fr=pc&uc_param_str=&pdir_fid=" +
      parentId +
      "&_fetch_total=1&_fetch_sub_dirs=0&_sort=file_type:asc,updated_at:desc";
    var pageSize = 100;
    var url = baseUrl + "&_page=1&_size=" + pageSize;
    fetch(url, { credentials: "include" })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        var list = (data.data && data.data.list) || [];
        var total = (data.metadata && data.metadata._total) || list.length;
        log("文件总数:", total, "当前页:", list.length);
        if (total <= list.length) {
          processFiles(list, callback);
          return;
        }
        // 拉取剩余页面
        var totalPages = Math.ceil(total / pageSize);
        var promises = [];
        for (var p = 2; p <= totalPages; p++) {
          promises.push(
            fetch(baseUrl + "&_page=" + p + "&_size=" + pageSize, {
              credentials: "include",
            })
              .then(function (r) {
                return r.json();
              })
              .then(function (d) {
                return (d.data && d.data.list) || [];
              }),
          );
        }
        Promise.all(promises)
          .then(function (pages) {
            for (var i = 0; i < pages.length; i++) {
              list = list.concat(pages[i]);
            }
            log("全部加载:", list.length, "个");
            processFiles(list, callback);
          })
          .catch(function () {
            processFiles(list, callback);
          });
      })
      .catch(function (e) {
        log("API错误:", e.message);
        callback([]);
      });
  }

  function processFiles(list, callback) {
    var files = list.map(function (x) {
      return { id: x.fid, name: x.file_name, type: x.file ? 1 : 0 };
    });
    var videoExts =
      "mkv|mp4|avi|mov|wmv|flv|webm|m4v|mpg|mpeg|ts|rmvb|m2ts|ogv|divx|xvid|3gp|vob|mts";
    files.sort(function (a, b) {
      var aExt = a.name.slice(a.name.lastIndexOf(".") + 1).toLowerCase();
      var bExt = b.name.slice(b.name.lastIndexOf(".") + 1).toLowerCase();
      var aIsVid = videoExts.indexOf(aExt) !== -1;
      var bIsVid = videoExts.indexOf(bExt) !== -1;
      if (aIsVid && !bIsVid) return -1;
      if (!aIsVid && bIsVid) return 1;
      return a.name.localeCompare(b.name, undefined, { numeric: true });
    });
    callback(files);
  }

  // TMDB搜索（电视剧+电影，带缓存）
  function searchTMDB(query, callback) {
    var key = getApiKey();
    if (!key) {
      callback([]);
      return;
    }

    var cacheKey = "search_" + query;
    var cached = apiCache[cacheKey];
    if (cached) {
      log("缓存命中:", query);
      callback(cached.data);
      return;
    }

    var urlTv =
      TMDB_BASE +
      "/search/tv?api_key=" +
      key +
      "&query=" +
      encodeURIComponent(query) +
      "&language=zh-CN";
    var urlMovie =
      TMDB_BASE +
      "/search/movie?api_key=" +
      key +
      "&query=" +
      encodeURIComponent(query) +
      "&language=zh-CN";

    var results = [];
    var pending = 2;

    function onLoad(data, type) {
      if (data && data.results) {
        data.results.forEach(function (item) {
          item.tmdbType = type;
          results.push(item);
        });
      }
      pending--;
      if (pending === 0) {
        results.sort(function (a, b) {
          return b.popularity - a.popularity;
        });
        apiCache[cacheKey] = { data: results };
        GM_setValue("tmdb_cache", JSON.stringify(apiCache));
        log("搜索已缓存并持久化:", query);
        callback(results);
      }
    }

    GM_xmlhttpRequest({
      method: "GET",
      url: urlTv,
      onload: function (r) {
        try {
          onLoad(JSON.parse(r.responseText), "tv");
        } catch (e) {
          onLoad(null, "tv");
        }
      },
      onerror: function () {
        onLoad(null, "tv");
      },
    });

    GM_xmlhttpRequest({
      method: "GET",
      url: urlMovie,
      onload: function (r) {
        try {
          onLoad(JSON.parse(r.responseText), "movie");
        } catch (e) {
          onLoad(null, "movie");
        }
      },
      onerror: function () {
        onLoad(null, "movie");
      },
    });
  }

  // 获取剧集详情（获取季数，带缓存）
  function getTVDetails(tvId, callback) {
    var key = getApiKey();
    if (!key) {
      callback(null);
      return;
    }

    var cacheKey = "tv_" + tvId;
    var cached = apiCache[cacheKey];
    if (cached) {
      log("TV详情缓存命中:", tvId);
      callback(cached.data);
      return;
    }

    var url = TMDB_BASE + "/tv/" + tvId + "?api_key=" + key + "&language=zh-CN";
    GM_xmlhttpRequest({
      method: "GET",
      url: url,
      onload: function (r) {
        try {
          var data = JSON.parse(r.responseText);
          if (data && data.id) {
            apiCache[cacheKey] = { data: data };
            GM_setValue("tmdb_cache", JSON.stringify(apiCache));
            log("TV详情已缓存并持久化:", tvId);
          }
          callback(data);
        } catch (e) {
          callback(null);
        }
      },
      onerror: function () {
        callback(null);
      },
    });
  }

  // 获取季剧集（带缓存）
  function getSeasonEpisodes(tvId, seasonNum, callback) {
    var key = getApiKey();
    if (!key) {
      callback([]);
      return;
    }

    var cacheKey = "season_" + tvId + "_" + seasonNum;
    var cached = apiCache[cacheKey];
    if (cached) {
      log("季剧集缓存命中:", tvId, "S" + seasonNum);
      callback(cached.data);
      return;
    }

    var url =
      TMDB_BASE +
      "/tv/" +
      tvId +
      "/season/" +
      seasonNum +
      "?api_key=" +
      key +
      "&language=zh-CN";
    GM_xmlhttpRequest({
      method: "GET",
      url: url,
      onload: function (r) {
        try {
          var data = JSON.parse(r.responseText);
          var eps = data.episodes || [];
          apiCache[cacheKey] = { data: eps };
          GM_setValue("tmdb_cache", JSON.stringify(apiCache));
          log("季剧集已缓存并持久化:", tvId, "S" + seasonNum);
          callback(eps);
        } catch (e) {
          callback([]);
        }
      },
      onerror: function () {
        callback([]);
      },
    });
  }

  // 重命名文件（仅夸克）
  function renameFile(fileId, newName, callback) {
    fetch(
      "https://drive-pc.quark.cn/1/clouddrive/file/rename?pr=ucpro&fr=pc&uc_param_str=",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ fid: fileId, file_name: newName }),
      },
    )
      .then(function (r) {
        return r.json();
      })
      .then(callback)
      .catch(function () {
        callback({ code: -1 });
      });
  }

  function setRenameVisible(visible) {
    var ui = document.getElementById("tmdb-rename-ui");
    if (ui) {
      ui.style.display = visible ? "block" : "none";
      uiVisible = visible;
      if (!visible) {
        // 清空通知队列并停止定时器
        notifyQueue = [];
        if (notifyTimer) {
          clearTimeout(notifyTimer);
          notifyTimer = null;
        }
        // 移除所有现有通知
        if (notifyContainer) {
          notifyContainer.innerHTML = "";
        }
      }
    }
  }

  function isRenameVisible() {
    return uiVisible;
  }

  // 创建Toolbar按钮
  function createToolbarButton() {
    log("开始创建夸克工具栏按钮");

    var btn = document.createElement("button");
    btn.id = "tmdb-rename-entry";
    btn.type = "button";
    btn.className = "ant-btn ant-btn-default";

    var btnIcon = document.createElement("img");
    btnIcon.src =
      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2352565e' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7'/%3E%3Cpath d='M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z'/%3E%3C/svg%3E";
    btnIcon.style.cssText =
      "width:16px;height:16px;margin-right:4px;vertical-align:middle;";

    var btnText = document.createElement("span");
    btnText.textContent = "重命名";

    btn.appendChild(btnIcon);
    btn.appendChild(btnText);

    btn.addEventListener("click", function () {
      log("点击重命名按钮，加载当前目录...");
      var shouldOpen = !isRenameVisible();
      setRenameVisible(shouldOpen);
      if (!shouldOpen) return;
      loadAndShow();
    });

    function loadAndShow() {
      if (typeof requestUiReload === "function") {
        requestUiReload();
      } else {
        log("UI尚未就绪，跳过主动刷新");
      }
    }

    function tryInsert() {
      var container = document.querySelector(".btn-main");
      if (!container) {
        container = document.querySelector(".btn-operate");
      }
      if (container) {
        container.appendChild(btn);
        log("按钮已插入");
        return;
      }
      // 兜底：固定到右下角
      btn.style.cssText = "position:fixed;bottom:20px;right:20px;z-index:99999";
      document.body.appendChild(btn);
      log("容器未找到，按钮固定在右下角");
    }

    tryInsert();
    log("createToolbarButton完成");

    // 保活：夸克切换目录会重建toolbar，按钮会被移除，这里自动回插
    setInterval(function () {
      if (!document.body.contains(btn)) {
        tryInsert();
      }
    }, 800);

    createUI();
  }

  // OpenAI 兼容请求器
  class OpenAICompatible {
    constructor({ baseURL, apiKey, model }) {
      this.baseURL = baseURL.replace(/\/+$/, "");
      this.apiKey = apiKey;
      this.model = model;
    }

    async chat(messages, options = {}) {
      if (typeof messages === "string") {
        messages = [{ role: "user", content: messages }];
      }

      const body = {
        model: this.model,
        messages,
        temperature: options.temperature ?? 0.2,
        max_tokens: options.max_tokens ?? 100,
        ...options,
      };

      if (this.baseURL.includes("openrouter") && options.provider !== false) {
        const cfg = getAIConfig();
        if (cfg.provider) {
          const onlyList = cfg.provider
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          if (onlyList.length > 0) {
            body.provider = { only: onlyList };
          }
        }
      }

      return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: "POST",
          url: `${this.baseURL}/chat/completions`,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          data: JSON.stringify(body),
          onload: (resp) => {
            try {
              log("AI ──── 请求 ────");
              log("AI URL:", `${this.baseURL}/chat/completions`);
              log("AI Model:", this.model);
              log("AI Messages:", JSON.stringify(messages));
              log("AI ──── 响应 ────");
              log("AI HTTP Status:", resp.status);
              log("AI Raw:", resp.responseText);
              const json = JSON.parse(resp.responseText);
              if (json.error) {
                log("AI Error:", json.error);
                reject(new Error(json.error.message || "AI 请求失败"));
                return;
              }
              const text = (json.choices?.[0]?.message?.content || "").trim();
              log("AI Result:", text);
              if (!text) {
                log("AI 返回体:", JSON.stringify(json));
                reject(new Error("AI 返回空内容"));
                return;
              }
              resolve(text);
            } catch (e) {
              log("AI Parse Error:", e.message);
              reject(e);
            }
          },
          onerror: (err) => {
            log("AI Network Error:", err);
            reject(new Error("网络错误"));
          },
        });
      });
    }
  }

  // 创建UI（默认隐藏）
  function createUI() {
    // 面包屑路径获取（仅夸克）
    function getBreadcrumbPath() {
      var container = document.querySelector(".file-list-breadcrumb .primary");
      if (!container) return "";
      var allSpans = container.querySelectorAll("span.bcrumb-filename");
      var parts = [];
      for (var i = 0; i < allSpans.length; i++) {
        var text =
          allSpans[i].getAttribute("title") || allSpans[i].textContent.trim();
        if (text) parts.push(text);
      }
      if (parts.length >= 2) return parts.join(" / ");

      var fullText = container.textContent.trim();
      var segments = fullText
        .split("/")
        .map((s) => s.trim())
        .filter(Boolean);
      if (segments.length >= 2) return segments.join(" / ");

      return parts.join(" / ") || fullText;
    }

    var style = document.createElement("style");
    style.textContent = `
      #tmdb-rename-ui {
        display: none;
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        z-index: 99999;
        background: #fff;
        border-radius: 12px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        padding: 16px;
        font-family: system-ui, sans-serif;
        max-height: 80vh;
        overflow: auto;
      }
      #tmdb-rename-ui * {
        box-sizing: border-box;
      }
      #tmdb-rename-ui .layout {
        display: grid;
        grid-template-columns: 600px 600px;
        gap: 12px;
        align-items: stretch;
      }
      #tmdb-rename-ui .left-col {
        height: 630px !important;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        border: 1px solid #eee;
        border-radius: 8px;
        padding: 12px;
        min-width: 0;
      }
      #tmdb-rename-ui .left-col h4 {
        margin: 0 0 8px;
        font-size: 14px;
        color: #333;
        display: flex;
        align-items: center;
      }
      #tmdb-rename-ui .right-col {
        height: 630px !important;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        border: 1px solid #eee;
        border-radius: 8px;
        padding: 12px;
        position: relative;
        min-width: 0;
      }
      #tmdb-rename-ui h3 {
        margin: 0 0 12px;
        font-size: 16px;
        color: #333;
        text-align: center;
      }
      #tmdb-rename-ui .close-btn {
        position: absolute;
        top: 8px;
        right: 12px;
        width: 30px;
        height: 30px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: none;
        border: none;
        font-size: 20px;
        cursor: pointer;
        color: #999;
        padding: 0;
      }

      #tmdb-rename-ui input,
      #tmdb-rename-ui select {
        width: 100%;
        padding: 8px 10px;
        border: 1px solid #ddd;
        border-radius: 6px;
        margin-bottom: 8px;
        font-size: 14px;
      }
      #tmdb-rename-ui #show-name,
      #tmdb-rename-ui #season-num,
      #tmdb-rename-ui #regex-from,
      #tmdb-rename-ui #regex-to {
        margin-bottom: 0;
      }
      #tmdb-rename-ui #season-num::-webkit-inner-spin-button,
      #tmdb-rename-ui #season-num::-webkit-outer-spin-button {
        -webkit-appearance: none;
        margin: 0;
      }
      #tmdb-rename-ui button {
        width: 100%;
        padding: 10px;
        background: #4a90e2;
        color: #fff;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        margin-bottom: 8px;
        font-size: 14px;
      }
      #tmdb-rename-ui button:hover {
        background: #357abd;
      }
      #tmdb-rename-ui #btn-rename {
        background: #28a745;
        margin-bottom: 0;
        margin-top: 12px;
      }
      #tmdb-rename-ui #btn-rename:hover {
        background: #218838;
      }
      #tmdb-rename-ui #btn-search {
        background: #4a90e2;
        border-color: #4a90e2;
        color: #fff;
      }
      #tmdb-rename-ui #btn-search:hover {
        background: #357abd;
        border-color: #357abd;
      }
      #tmdb-rename-ui #btn-ai-recognize:hover {
        background: #f0f0f0;
      }
      #tmdb-rename-ui #btn-clear-cache:hover {
        color: #666;
      }
      #tmdb-rename-ui #tmdb-search,
      #tmdb-rename-ui #btn-ai-recognize,
      #tmdb-rename-ui #btn-search {
        box-sizing: border-box;
        height: 32px;
        line-height: 32px;
        margin: 0;
      }

      #tmdb-rename-ui #file-select-all-label {
        font-size: 12px;
        font-weight: normal;
        color: #666;
        cursor: pointer;
        user-select: none;
      }
      #tmdb-rename-ui #file-select-all-label:hover {
        color: #333;
      }
      #tmdb-rename-ui #file-list {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        overflow-x: hidden;
        border: 0;
        padding: 6px 0;
        background: #fff;
        display: flex;
        flex-direction: column;
        gap: 2px;
        scrollbar-width: none;
      }
      #tmdb-rename-ui #file-list::-webkit-scrollbar {
        display: none;
      }
      #tmdb-rename-ui #file-list .pair-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 28px minmax(0, 1fr);
        gap: 8px;
        align-items: center;
        margin-bottom: 6px;
      }
      #tmdb-rename-ui #file-list .pair-row:last-child {
        margin-bottom: 0;
      }
      #tmdb-rename-ui #file-list .pair-arrow {
        color: #9aa3af;
        font-size: 12px;
        text-align: center;
        user-select: none;
      }
      #tmdb-rename-ui #file-list .drag-chip {
        display: flex;
        align-items: center;
        gap: 6px;
        min-height: 32px;
        padding: 4px 6px;
        border: 1px solid #f1f1f1;
        border-radius: 4px;
        background: #fafafa;
        cursor: grab;
      }
      #tmdb-rename-ui #file-list .drag-chip.dragging {
        opacity: 0.55;
      }
      #tmdb-rename-ui #file-list .drag-chip.drag-over {
        border-color: #4a90e2;
        background: #eef6ff;
      }
      #tmdb-rename-ui #file-list .drag-chip input[type="checkbox"] {
        width: auto;
        margin: 0;
      }
      #tmdb-rename-ui #file-list .idx {
        width: 22px;
        color: #999;
        text-align: right;
        font-size: 11px;
        flex-shrink: 0;
      }
      #tmdb-rename-ui #file-list .text {
        flex: 1;
        min-width: 0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 12px;
      }
      #tmdb-rename-ui #file-list .source-text {
        color: #666;
      }
      #tmdb-rename-ui #file-list .target-text {
        color: #4a90e2;
      }

      #tmdb-rename-ui #panel-tmdb {
        flex: 1;
        min-height: 0;
        flex-direction: column;
      }
      #tmdb-rename-ui #panel-tmdb .tmdb-panels {
        flex: 1;
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
        min-height: 0;
      }
      #tmdb-rename-ui #panel-tmdb .tmdb-results-wrap,
      #tmdb-rename-ui #panel-tmdb .tmdb-episodes-wrap {
        display: flex;
        flex: 1;
        min-height: 0;
      }

      #tmdb-rename-ui .tmdb-panels {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
        margin-bottom: 12px;
      }
      #tmdb-rename-ui .tmdb-results-wrap {
        display: flex;
        flex-direction: column;
        min-width: 0;
      }
      #tmdb-rename-ui .tmdb-episodes-wrap {
        display: flex;
        flex-direction: column;
        min-width: 0;
        position: relative;
      }
      #tmdb-rename-ui .tmdb-results-wrap .list {
        flex: 1;
        border: 0;
        overflow-y: auto;
        scrollbar-width: none;
      }
      #tmdb-rename-ui .tmdb-results-wrap .list::-webkit-scrollbar {
        display: none;
      }
      #tmdb-rename-ui .tmdb-episodes-wrap .list {
        flex: 1;
        border: 0;
        overflow-y: auto;
        scrollbar-width: none;
      }
      #tmdb-rename-ui .tmdb-episodes-wrap .list::-webkit-scrollbar {
        display: none;
      }
      #tmdb-rename-ui .tmdb-episodes-wrap .item {
        flex-direction: column;
        align-items: stretch;
        gap: 2px;
        padding: 6px 50px 6px 10px;
        overflow: hidden;
      }
      #tmdb-rename-ui .tmdb-episodes-wrap .ep-meta {
        font-size: 11px;
        color: #888;
        white-space: nowrap;
      }
      #tmdb-rename-ui .tmdb-episodes-wrap .ep-name {
        font-size: 13px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      #tmdb-rename-ui #season-pills {
        flex-shrink: 0;
        scrollbar-width: none;
      }
      #tmdb-rename-ui #season-pills::-webkit-scrollbar {
        display: none;
      }
      #tmdb-rename-ui .season-pill {
        width: auto;
        flex-shrink: 0;
        padding: 3px 10px;
        font-size: 12px;
        color: #666;
        background: #f0f0f0;
        border: none;
        border-radius: 12px;
        cursor: pointer;
        transition: all 0.15s;
        white-space: nowrap;
        margin-bottom: 0;
      }
      #tmdb-rename-ui .season-pill:hover {
        background: #e0e0e0;
      }
      #tmdb-rename-ui .season-pill.active {
        background: #4a90e2;
        color: #fff;
      }

      #tmdb-rename-ui .list {
        overflow-y: auto;
        border: 1px solid #eee;
        margin-bottom: 0;
        border-radius: 6px;
      }
      #tmdb-rename-ui .item {
        position: relative;
        transition: background 0.2s;
        padding: 8px 10px;
        border-bottom: 1px solid #f5f5f5;
        cursor: pointer;
        font-size: 13px;
        display: flex;
        align-items: center;
      }
      #tmdb-rename-ui .item:hover {
        background: #f0f7ff;
      }
      #tmdb-rename-ui .item.selected {
        background: #e6f7ff;
        border-left: 3px solid #4a90e2;
      }
      #tmdb-rename-ui .item:first-child {
        border-radius: 6px 6px 0 0;
      }
      #tmdb-rename-ui .item:last-child {
        border-radius: 0 0 6px 6px;
        border-bottom: none;
      }
      #tmdb-rename-ui .item:first-child:last-child {
        border-radius: 6px;
        border-bottom: none;
      }
      #tmdb-rename-ui .item .type-badge {
        position: absolute;
        top: 10px;
        right: 10px;
        padding: 2px 6px;
        border-radius: 4px;
        font-size: 11px;
        color: #fff;
        line-height: 1.2;
      }
      #tmdb-rename-ui .item .type-badge.tv {
        background: #4a90e2;
      }
      #tmdb-rename-ui .item .type-badge.movie {
        background: #28a745;
      }
      #tmdb-rename-ui .item .poster {
        width: 40px;
        height: 60px;
        object-fit: cover;
        margin-right: 10px;
        border-radius: 4px;
        flex-shrink: 0;
      }
      #tmdb-rename-ui .item .info {
        flex: 1;
        min-width: 0;
      }
      #tmdb-rename-ui .item .name {
        font-weight: 500;
        margin-bottom: 2px;
      }
      #tmdb-rename-ui .item .year {
        color: #888;
        font-size: 12px;
      }

      @media (max-width: 1040px) {
        #tmdb-rename-ui {
          width: min(98vw, 760px);
        }
        #tmdb-rename-ui .layout {
          grid-template-columns: 1fr;
        }
        #tmdb-rename-ui #file-list {
          height: 320px;
        }
      }
    
    `;
    document.head.appendChild(style);

    var div = document.createElement("div");
    div.id = "tmdb-rename-ui";
    div.innerHTML = `
      <button class="close-btn" id="btn-close">&times;</button>
      <h3>夸克网盘批量重命名 ( TMDB、AI 识别 )</h3>
      <div class="layout">
        <div class="left-col">
          <h4 style="display: flex; align-items: center">
            文件列表<label
              id="file-select-all-label"
              style="margin-left: auto; display: flex; align-items: center; gap: 3px"
              ><input
                type="checkbox"
                id="btn-select-files"
                style="width: auto; margin: 0"
              />
              全选</label
            >
          </h4>
          <div id="file-list"></div>
          <div style="border-top: 1px solid #eee; padding-top: 8px; margin-top: 8px; flex-shrink: 0;">
            <div style="display: flex; gap: 6px; align-items: center; margin-bottom: 6px; font-size: 12px;">
              <span style="flex-shrink: 0; color: #999;">剧名</span>
              <input type="text" id="show-name" placeholder="影视剧名称" style="flex: 1; height: 28px; padding: 0 8px; font-size: 12px; border: 1px solid #ddd; border-radius: 4px;" />
              <span style="flex-shrink: 0; color: #999;">季</span>
              <span style="display: inline-flex; align-items: center; border: 1px solid #ddd; border-radius: 4px; overflow: hidden; height: 28px;">
                <button class="season-stepper" data-dir="down" style="width: 20px; height: 28px; padding: 0; margin: 0; border: none; border-right: 1px solid #eee; border-radius: 0; background: #f5f5f5; font-size: 10px; color: #666; cursor: pointer; line-height: 1;">−</button>
                <input type="number" id="season-num" value="1" min="0" max="99" style="width: 36px; height: 28px; padding: 0; margin: 0; font-size: 12px; border: none; border-radius: 0; text-align: center; -moz-appearance: textfield;" />
                <button class="season-stepper" data-dir="up" style="width: 20px; height: 28px; padding: 0; margin: 0; border: none; border-left: 1px solid #eee; border-radius: 0; background: #f5f5f5; font-size: 10px; color: #666; cursor: pointer; line-height: 1;">+</button>
              </span>
              <button id="btn-gen" style="width: auto; flex-shrink: 0; padding: 4px 10px; font-size: 12px; margin-bottom: 0;">生成</button>
              <span id="extract-hint" style="font-size: 11px; color: #bbb; flex-shrink: 0; white-space: nowrap; display: inline-block; min-width: 155px; text-align: right;">→ 按 剧集名.S01E01 递增命名</span>
            </div>
            <div style="display: flex; gap: 6px; align-items: center; font-size: 12px;">
              <span style="flex-shrink: 0; color: #999;">匹配</span>
              <input type="text" id="regex-from" placeholder="正则表达式" style="flex: 1; height: 28px; padding: 0 8px; font-size: 12px; border: 1px solid #ddd; border-radius: 4px;" />
              <span style="flex-shrink: 0; color: #999;">替换</span>
              <input type="text" id="regex-to" placeholder="替换为" style="flex: 1; height: 28px; padding: 0 8px; font-size: 12px; border: 1px solid #ddd; border-radius: 4px;" />
              <button id="btn-regex" style="width: auto; flex-shrink: 0; padding: 4px 10px; font-size: 12px; margin-bottom: 0;">执行</button>
              <span style="font-size: 11px; color: #bbb; flex-shrink: 0; white-space: nowrap; display: inline-block; min-width: 155px; text-align: right;">→ 修改源文件名 → 目标文件名</span>
            </div>
          </div>
        </div>
        <div class="right-col">
          <div id="panel-tmdb" style="flex: 1; display: flex; flex-direction: column; min-height: 0;">
            <div style="display: flex; align-items: stretch; margin-bottom: 12px">
              <button
                id="btn-ai-recognize"
                title="AI 识别剧名"
                style="
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  width: 38px;
                  height: 38px;
                  padding: 0;
                  border: 1px solid #ddd;
                  border-radius: 6px 0 0 6px;
                  background: #fff;
                  cursor: pointer;
                  flex-shrink: 0;
                "
                onmouseover="
                  this.style.background = '#0a8c08b2';
                  this.style.borderColor = '#c3d5f0';
                "
                onmouseout="
                  this.style.background = '#fff';
                  this.style.borderColor = '#ddd';
                "
              >
                ✨
              </button>
              <input
                type="text"
                id="tmdb-search"
                placeholder="搜索剧集名称(中文)"
                style="
                  flex: 1;
                  height: 38px;
                  padding: 0 10px;
                  font-size: 14px;
                  border: 1px solid #ddd;
                  border-left: none;
                  border-right: none;
                  border-radius: 0;
                  box-sizing: border-box;
                "
              />
              <button
                id="btn-search"
                title="搜索"
                style="
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  width: 36px;
                  height: 38px;
                  padding: 0;
                  border: 1px solid #4a90e2;
                  border-radius: 0 6px 6px 0;
                  background: #4a90e2;
                  cursor: pointer;
                  flex-shrink: 0;
                "
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  style="color: #fff"
                >
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </button>
              <span
                id="btn-clear-cache"
                style="
                  color: #999;
                  cursor: pointer;
                  font-size: 12px;
                  text-decoration: underline;
                  user-select: none;
                  flex-shrink: 0;
                  margin-left: 8px;
                  align-self: center;
                "
                onmouseover="this.style.color = '#666'"
                onmouseout="this.style.color = '#999'"
                >重置缓存</span
              >
            </div>
            <div class="tmdb-panels">
              <div class="tmdb-results-wrap">
                <div id="tmdb-results" class="list"></div>
              </div>
              <div class="tmdb-episodes-wrap">
                <div style="display: flex; align-items: center; flex-shrink: 0; padding-bottom: 8px; margin-top: 8px;">
                  <div id="season-pills" style="display: none; align-items: center; gap: 4px; overflow-x: auto; flex: 1; min-width: 0;"></div>
                  <label
                    id="episode-select-all-label"
                    style="
                      display: none;
                      flex-shrink: 0;
                      cursor: pointer;
                      padding-left: 8px;
                    "
                    ><input
                      type="checkbox"
                      id="btn-select-all"
                      style="width: auto; margin: 0;"
                  /></label>
                </div>
                <div id="tmdb-episodes" class="list" style="display: none"></div>
              </div>
            </div>
            <div style="display: flex; gap: 8px">
              <button id="btn-apply" style="flex: 2; visibility: hidden; margin-bottom: 0">
                使用 TMDB 文件名
              </button>
            </div>
          </div>
        </div>      </div>
      <button id="btn-rename">开始重命名</button>

    `;
    document.body.appendChild(div);

    // 关闭按钮
    div.querySelector("#btn-close").addEventListener("click", function () {
      setRenameVisible(false);
    });

    // 点击外部关闭弹出框
    document.addEventListener("mousedown", function (e) {
      if (!isRenameVisible()) return;
      if (!div.contains(e.target)) setRenameVisible(false);
    });

    // 全选/取消全选（按钮文本固定“全选”）
    div
      .querySelector("#btn-select-files")
      .addEventListener("change", function () {
        if (this.checked) {
          state.sourceItems.forEach(function (item) {
            state.selectedFileIds.add(toId(item.id));
          });
        } else {
          state.selectedFileIds.clear();
        }
        renderFiles();
      });

    document.addEventListener("keydown", function (e) {
      if (
        e.key === "Escape" &&
        !e.isComposing &&
        document.activeElement.tagName !== "INPUT"
      )
        setRenameVisible(false);
    });

    log("API Key:", getApiKey() ? "已设置" : "未设置");

    // 文件列表状态
    var state = {
      sourceItems: [],
      targetItems: [],
      selectedFileIds: new Set(),
      draggingKind: "",
      draggingIndex: -1,
      tmdbShowTitle: "",
      tmdbShowYear: "",
      pendingAutoSeason: null,
    };

    function toId(v) {
      return String(v);
    }

    function escapeHtml(str) {
      return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }

    function getFileExt(name) {
      var idx = name.lastIndexOf(".");
      return idx > -1 ? name.slice(idx + 1) : "";
    }

    function moveItem(arr, from, to) {
      if (
        from === to ||
        from < 0 ||
        to < 0 ||
        from >= arr.length ||
        to >= arr.length
      )
        return;
      var item = arr.splice(from, 1)[0];
      arr.splice(to, 0, item);
    }

    function initListState(list) {
      var files = list.filter(function (x) {
        return x.type === 1;
      });
      state.sourceItems = files.map(function (f) {
        return { id: f.id, name: f.name };
      });
      state.targetItems = state.sourceItems.map(function (f) {
        return { key: toId(f.id), name: f.name };
      });
      var videoExts =
        "mkv|mp4|avi|mov|wmv|flv|webm|m4v|mpg|mpeg|ts|rmvb|m2ts|ogv|divx|xvid|3gp|vob|mts";
      state.selectedFileIds = new Set(
        state.sourceItems
          .filter(function (f) {
            var ext = f.name.slice(f.name.lastIndexOf(".") + 1).toLowerCase();
            return videoExts.indexOf(ext) !== -1;
          })
          .map(function (f) {
            return toId(f.id);
          }),
      );
    }

    function clearDragStyles() {
      div.querySelectorAll("#file-list .drag-chip").forEach(function (row) {
        row.classList.remove("dragging");
        row.classList.remove("drag-over");
      });
    }

    function bindCheckboxHandlers() {
      div
        .querySelectorAll("#file-list .source-chip input[type=checkbox]")
        .forEach(function (cb) {
          cb.addEventListener("change", function () {
            var id = this.dataset.id;
            if (this.checked) state.selectedFileIds.add(id);
            else state.selectedFileIds.delete(id);
            var fc = div.querySelector("#btn-select-files");
            if (fc) {
              fc.checked =
                state.selectedFileIds.size === state.sourceItems.length &&
                state.sourceItems.length > 0;
              fc.indeterminate =
                state.selectedFileIds.size > 0 &&
                state.selectedFileIds.size < state.sourceItems.length;
            }
          });
        });
    }

    function autoScrollList(pointerY) {
      var container = div.querySelector("#file-list");
      if (!container) return;
      var rect = container.getBoundingClientRect();
      var edge = 36;
      var step = 16;
      if (pointerY < rect.top + edge) {
        container.scrollTop -= step;
      } else if (pointerY > rect.bottom - edge) {
        container.scrollTop += step;
      }
    }

    function bindDragHandlers(kind) {
      var selector =
        kind === "source"
          ? "#file-list .source-chip"
          : "#file-list .target-chip";
      div.querySelectorAll(selector).forEach(function (row) {
        row.addEventListener("dragstart", function (e) {
          state.draggingKind = kind;
          state.draggingIndex = Number(this.dataset.index);
          this.classList.add("dragging");
          if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", String(state.draggingIndex));
          }
        });
        row.addEventListener("dragover", function (e) {
          if (state.draggingKind !== kind) return;
          e.preventDefault();
          autoScrollList(e.clientY);
          this.classList.add("drag-over");
          if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
        });
        row.addEventListener("dragleave", function () {
          this.classList.remove("drag-over");
        });
        row.addEventListener("drop", function (e) {
          if (state.draggingKind !== kind) return;
          e.preventDefault();
          var to = Number(this.dataset.index);
          if (kind === "source")
            moveItem(state.sourceItems, state.draggingIndex, to);
          else moveItem(state.targetItems, state.draggingIndex, to);
          state.draggingKind = "";
          state.draggingIndex = -1;
          renderFiles();
        });
        row.addEventListener("dragend", function () {
          state.draggingKind = "";
          state.draggingIndex = -1;
          clearDragStyles();
        });
      });
    }
    function sanitizeFileName(name) {
      // 替换文件名中不允许的字符为空格
      return name
        .replace(/[\\/:*?"<>|]/g, " ")
        .replace(/\s{2,}/g, " ")
        .trim();
    }
    function renderFiles() {
      var rowsHtml = "";
      for (var i = 0; i < state.sourceItems.length; i++) {
        var source = state.sourceItems[i];
        var target = state.targetItems[i] || { name: "" };
        var sourceId = toId(source.id);
        var checked = state.selectedFileIds.has(sourceId);
        rowsHtml +=
          '<div class="pair-row">' +
          '<div class="drag-chip source-chip" draggable="true" data-index="' +
          i +
          '">' +
          '<input type="checkbox" ' +
          (checked ? "checked" : "") +
          ' data-id="' +
          sourceId +
          '">' +
          '<span class="idx">' +
          (i + 1) +
          "</span>" +
          '<span class="text source-text" title="' +
          escapeHtml(source.name) +
          '">' +
          escapeHtml(source.name) +
          "</span>" +
          "</div>" +
          '<div class="pair-arrow">→</div>' +
          '<div class="drag-chip target-chip" draggable="true" data-index="' +
          i +
          '">' +
          '<span class="idx">' +
          (i + 1) +
          "</span>" +
          '<span class="text target-text" title="' +
          escapeHtml(target.name) +
          '">' +
          escapeHtml(target.name) +
          "</span>" +
          "</div>" +
          "</div>";
      }

      div.querySelector("#file-list").innerHTML =
        rowsHtml ||
        '<div style="padding:8px;color:#999;font-size:12px;">当前目录没有可用文件</div>';

      bindCheckboxHandlers();
      bindDragHandlers("source");
      bindDragHandlers("target");
      var fc = div.querySelector("#btn-select-files");
      if (fc) {
        fc.checked =
          state.selectedFileIds.size === state.sourceItems.length &&
          state.sourceItems.length > 0;
        fc.indeterminate =
          state.selectedFileIds.size > 0 &&
          state.selectedFileIds.size < state.sourceItems.length;
      }
    }

    /**
     * 预处理搜索关键词（目录名/文件名清洗）
     */
    function preprocessSearchKey(raw) {
      if (!raw) return "";

      var chnMatch = raw.match(/^\[([^\]]+)\]/);
      if (chnMatch) {
        return chnMatch[1].trim();
      }

      var title = raw;
      var seasonPattern =
        /(.+?)[.\-_ ](?=S\d{1,3}(?:E\d{1,3})?(?![a-zA-Z0-9])|Season\s*\d|第\s*\d+\s*季)/i;
      var match = raw.match(seasonPattern);
      if (match) {
        title = match[1];
      }

      var RULES = [
        { pattern: /\./g, replacement: " " },
        { pattern: /\s*\(?(19|20)\d{2}\)?\s*/g, replacement: " " },
        {
          pattern: /\b(2160p|1080p|720p|480p|4k|uhd)\b/gi,
          replacement: " ",
        },
        {
          pattern: /\b(hevc|h\.?264|h\.?265|x264|x265|av1|vp9)\b/gi,
          replacement: " ",
        },
        {
          pattern:
            /\b(aac|ac3|dts|ddp?5\.?1|ddp?7\.?1|atmos|truehd|flac|opus)\b/gi,
          replacement: " ",
        },
        {
          pattern:
            /\b(web-dl|webrip|bluray|bdrip|hdrip|dvdrip|hdtv|pdtv|amzn|nf|dsnp|hulu|atvp)\b/gi,
          replacement: " ",
        },
        { pattern: /\s*[-.]\s*\b[a-zA-Z0-9]+\s*$/g, replacement: "" },
        { pattern: /\s{2,}/g, replacement: " " },
      ];

      for (var i = 0; i < RULES.length; i++) {
        title = title.replace(RULES[i].pattern, RULES[i].replacement);
      }

      return title.replace(/^[\s.\-]+|[\s.\-]+$/g, "").trim();
    }

    async function extractTitleByAI(breadcrumbText, force) {
      var cfg = getAIConfig();
      if (!cfg.apiKey) return null;

      var cacheKey = "ai_" + breadcrumbText;
      if (!force) {
        var cached = aiTitleCache[cacheKey];
        if (cached) {
          var season = cached.season || 1; // 兼容旧缓存无 season 字段
          log(
            "AI 缓存命中:",
            breadcrumbText,
            "→",
            cached.value,
            "季数",
            season,
          );
          // 旧缓存只存剧名，季数默认为1
          return { value: cached.value, season: season, cached: true };
        }
      }

      var ai = new OpenAICompatible({
        baseURL: cfg.baseURL,
        apiKey: cfg.apiKey,
        model: cfg.model,
      });

      var systemPrompt =
        "输入面包屑路径，仅输出剧集或电影名称和季数，格式“剧名|数字”，季数不明时填1；优先中文，禁止解释，禁止显示年份信息。示例：影视剧/克拉克森的农场(S01-S04合集)/Clarksons.Farm.S02... => 克拉克森的农场|2";

      try {
        var result = await ai.chat([
          { role: "system", content: systemPrompt },
          { role: "user", content: breadcrumbText },
        ]);
        log("AI 原始回复:", result);
        var cleaned = result
          .trim()
          .replace(/^["']|["']$/g, "")
          .trim();
        if (!cleaned) throw new Error("AI 返回空字符串");

        // 解析剧名和季数
        var parts = cleaned.split("|");
        var showName = parts[0].trim();
        var season = parseInt(parts[1]) || 1;
        // 缓存只存储剧名
        aiTitleCache[cacheKey] = {
          value: showName,
          season: season,
          time: Date.now(),
        };
        GM_setValue("ai_title_cache", JSON.stringify(aiTitleCache));
        log("AI 结果已缓存并持久化:", showName, "季数", season);
        return { value: showName, season: season, cached: false };
      } catch (e) {
        err("AI 提取失败: " + e.message);
        throw e;
      }
    }

    function loadFileList() {
      resetTMDBSection();
      log("开始加载文件列表...");
      getFileList(function (list) {
        initListState(list);
        renderFiles();
        log("加载文件:", state.sourceItems.length, "个");
        // 仅当有文件时才触发自动搜索
        if (state.sourceItems.length > 0) {
          autoSearchTMDB(div);
        }
      });
    }

    async function autoSearchTMDB(div) {
      log("autoSearchTMDB 被调用");
      if (!div) return;

      if (state.sourceItems.length === 0) {
        log("文件列表为空，跳过自动 TMDB 搜索");
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 600));

      var rawPath = getBreadcrumbPath();
      log("完整面包屑:", rawPath);

      if (!rawPath) {
        log("未找到面包屑，尝试文件名");
        if (state.sourceItems && state.sourceItems.length > 0) {
          rawPath = state.sourceItems[0].name || "";
        }
      }

      var finalQuery = "";

      if (rawPath) {
        var cfg = getAIConfig();
        if (cfg.apiKey) {
          notify("🤖 正在使用 AI 提取剧名...", "info");
          try {
            var aiRes = await extractTitleByAI(rawPath, false);
            if (aiRes && aiRes.value) {
              finalQuery = aiRes.value;
            } else {
              throw new Error("AI 返回空");
            }
          } catch (e) {
            err("AI 提取失败:", e.message);
            notify("AI 自动识别错误，请手动执行", "error");
            finalQuery = preprocessSearchKey(rawPath);
          }
        } else {
          finalQuery = preprocessSearchKey(rawPath);
          log("本地正则结果:", finalQuery);
        }
      }

      var input = document.querySelector("#tmdb-search");
      if (input) {
        input.value = finalQuery || "";
        if (finalQuery) {
          log("已填入搜索框:", finalQuery);
          if (aiRes && finalQuery) {
            var targetSeason = aiRes.season || 1;
            log("准备自动搜索并匹配, 剧名:", finalQuery, "季数:", targetSeason);
            performSearch(finalQuery, false, function (results) {
              log("自动搜索回调已触发, 结果数量:", results.length);
              var matched = autoMatchAndSelect(
                results,
                finalQuery,
                targetSeason,
              );
              if (matched) {
                notify("AI 自动识别完成", "success");
              }
            });
          }
        }
      }
    }

    requestUiReload = loadFileList;

    // 生成名字
    div.querySelector("#btn-gen").addEventListener("click", function () {
      var name = div.querySelector("#show-name").value.trim();
      var season = div.querySelector("#season-num").value.trim() || "1";
      if (!name) {
        notify("请输入剧集名称", "error");
        return;
      }
      state.targetItems = state.sourceItems.map(function (f, i) {
        var ext = getFileExt(f.name);
        var ep = String(i + 1).padStart(2, "0");
        return {
          key: toId(f.id),
          name:
            name +
            ".S" +
            season.padStart(2, "0") +
            "E" +
            ep +
            (ext ? "." + ext : ""),
        };
      });
      renderFiles();
    });

    // Season stepper 按钮
    div.querySelectorAll(".season-stepper").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var input = div.querySelector("#season-num");
        var val = parseInt(input.value);
        if (isNaN(val)) val = 1;
        if (this.dataset.dir === "up") val++;
        else val--;
        if (val < 0) val = 0;
        if (val > 99) val = 99;
        input.value = val;
        updateExtractHint();
      });
    });

    // Season input 变化时更新 hint
    var seasonInput = div.querySelector("#season-num");
    seasonInput.addEventListener("input", updateExtractHint);
    seasonInput.addEventListener("change", updateExtractHint);

    function updateExtractHint() {
      var sn = div.querySelector("#season-num");
      var v = parseInt(sn.value);
      var s = String(isNaN(v) ? 1 : v).padStart(2, "0");
      var hint = div.querySelector("#extract-hint");
      if (hint) hint.textContent = "→ 按 剧集名.S" + s + "E01 递增命名";
    }

    // 应用正则
    div.querySelector("#btn-regex").addEventListener("click", function () {
      var from = div.querySelector("#regex-from").value;
      var to = div.querySelector("#regex-to").value;
      try {
        var re = new RegExp(from);
        state.targetItems = state.sourceItems.map(function (f) {
          return { key: toId(f.id), name: f.name.replace(re, to) };
        });
        renderFiles();
      } catch (e) {
        notify("正则表达式错误", "error");
      }
    });

    // AI 识别剧名按钮
    div
      .querySelector("#btn-ai-recognize")
      .addEventListener("click", async function () {
        var rawPath = getBreadcrumbPath();
        if (!rawPath) {
          if (state.sourceItems.length > 0) rawPath = state.sourceItems[0].name;
          if (!rawPath) {
            notify("无法获取路径", "error");
            return;
          }
        }
        var cfg = getAIConfig();
        if (!cfg.apiKey) {
          notify("请先配置 AI", "error");
          return;
        }
        state.pendingAutoSeason = null; // 清除自动选季状态
        notify("🤖 正在 AI 提取...", "info");
        try {
          var aiRes = await extractTitleByAI(rawPath, true);
          if (aiRes && aiRes.value) {
            document.querySelector("#tmdb-search").value = aiRes.value;
            var targetSeason = aiRes.season || 1;
            performSearch(aiRes.value, false, function (results) {
              var matched = autoMatchAndSelect(
                results,
                aiRes.value,
                targetSeason,
              );
              if (matched) {
                notify("AI 自动识别完成", "success");
              }
            });
          }
        } catch (e) {
          notify("AI 自动识别错误，请手动执行", "error");
        }
      });

    // 规范化标题：去除括号年份、保留字母数字和中文，转小写
    function normalizeTitle(s) {
      return s
        .replace(/\s*\(\d{4}\)\s*$/, "") // 去除末尾括号年份
        .replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, "") // 去除所有非字母数字非中文
        .toLowerCase();
    }

    // 自动匹配搜索结果并选中剧集，设定待选季数
    function autoMatchAndSelect(results, targetShowName, targetSeason) {
      if (!results || !targetShowName) return false;
      var normTarget = normalizeTitle(targetShowName);
      log("自动匹配目标剧名:", normTarget);

      // 精确匹配（规范化后）
      var match = null;
      for (var i = 0; i < results.length; i++) {
        var r = results[i];
        var name = normalizeTitle(r.name || r.title || "");
        log("对比:", name, "vs", normTarget);
        if (name === normTarget) {
          match = r;
          break;
        }
      }

      if (!match) {
        log("自动匹配失败，未在搜索结果中找到规范化剧名:", normTarget);
        notify("AI 自动识别错误，请手动执行", "error");
        return false;
      }
      // 先设定待选季数，再模拟点击（确保 selectShow 内能读取到）
      state.pendingAutoSeason = targetSeason;
      var items = div.querySelectorAll("#tmdb-results .item");
      for (var j = 0; j < items.length; j++) {
        if (items[j].dataset.id === String(match.id)) {
          items[j].click();
          break;
        }
      }

      return true;
    }

    // 统一搜索与渲染，isManual 为 true 表示手动触发，会清除缓存
    function performSearch(query, isManual, onComplete) {
      if (!uiVisible) return;
      if (!query) {
        notify("请输入搜索内容", "error");
        return;
      }
      var key = getApiKey();
      if (!key) {
        notify("请先在油猴菜单设置TMDB API Key", "error");
        return;
      }

      if (isManual) {
        // 手动搜索：先删除当前搜索词缓存，触发重新请求
        var searchCacheKey = "search_" + query;
        delete apiCache[searchCacheKey];
        log("手动搜索，已清除相关缓存，准备重新请求:", query);
      }

      searchTMDB(query, function (results) {
        if (isManual) {
          // 手动搜索：清除所有电视相关的详情和季缓存
          Object.keys(apiCache).forEach(function (key) {
            if (key.startsWith("tv_") || key.startsWith("season_")) {
              delete apiCache[key];
            }
          });
          GM_setValue("tmdb_cache", JSON.stringify(apiCache));
          log("已清除相关剧集缓存并持久化");
        }

        // 渲染结果
        var html = "";
        results.forEach(function (r) {
          var year = (r.first_air_date || r.release_date || "").slice(0, 4);
          var typeClass = r.tmdbType === "tv" ? "tv" : "movie";
          var typeLabel = r.tmdbType === "tv" ? "TV" : "Movie";
          html +=
            '<div class="item" data-id="' +
            r.id +
            '" data-type="' +
            r.tmdbType +
            '" data-year="' +
            year +
            '">' +
            (r.poster_path
              ? '<img class="poster" src="https://image.tmdb.org/t/p/w92' +
                r.poster_path +
                '">'
              : "") +
            "<b>" +
            (r.name || r.title) +
            "</b> (" +
            year +
            ")" +
            '<span class="type-badge ' +
            typeClass +
            '">' +
            typeLabel +
            "</span>" +
            "</div>";
        });
        div.querySelector("#tmdb-results").innerHTML = html || "无结果";
        div.querySelectorAll("#tmdb-results .item").forEach(function (item) {
          item.addEventListener("click", function () {
            div.querySelectorAll("#tmdb-results .item").forEach(function (x) {
              x.classList.remove("selected");
            });
            this.classList.add("selected");
            var type = this.dataset.type;
            var id = this.dataset.id;
            var title = this.querySelector("b").textContent;
            var year = this.dataset.year;
            var showName = title + (year ? " (" + year + ")" : "");
            state.tmdbShowTitle = title;
            state.tmdbShowYear = year || "";

            if (type === "movie") {
              // 电影模式：隐藏 season-pills、tmdb-episodes、label，显示 btn-apply
              div.querySelector("#season-pills").style.display = "none";
              div.querySelector("#tmdb-episodes").style.display = "none";
              div.querySelector("#episode-select-all-label").style.display =
                "none";
              div.querySelector("#btn-apply").style.visibility = "visible";

              // 重新绑定 apply 事件（先移除旧事件再添加）
              var applyBtn = div.querySelector("#btn-apply");
              var newApply = function () {
                if (!state.tmdbShowTitle) return notify("无电影名称", "error");
                var newTargets = state.targetItems.map(function (x) {
                  return { key: x.key, name: x.name };
                });
                for (var i = 0; i < state.sourceItems.length; i++) {
                  var source = state.sourceItems[i];
                  if (!state.selectedFileIds.has(toId(source.id))) continue;
                  var ext = getFileExt(source.name);
                  var safeName = sanitizeFileName(
                    state.tmdbShowTitle +
                      (state.tmdbShowYear
                        ? " (" + state.tmdbShowYear + ")"
                        : ""),
                  );
                  var newName = safeName + (ext ? "." + ext : "");
                  newTargets[i] = { key: toId(source.id), name: newName };
                  break; // 只生成一条，避免后续重复
                }
                state.targetItems = newTargets;
                renderFiles();
                notify("已应用电影名到目标", "success");
              };
              // 移除旧监听器（最简单方式：替换元素克隆）
              var newApplyBtn = applyBtn.cloneNode(true);
              applyBtn.parentNode.replaceChild(newApplyBtn, applyBtn);
              newApplyBtn.addEventListener("click", newApply);
            } else {
              // TV 模式：隐藏 tmdb-episodes 和按钮，交由 selectShow 处理
              div.querySelector("#tmdb-episodes").style.display = "none";
              div.querySelector("#btn-apply").style.visibility = "hidden";
              selectShow(id, showName);
            }
          });
        });

        if (typeof onComplete === "function") {
          onComplete(results);
        }
      });
    }
    // 重置缓存（仅清除，不搜索）
    div
      .querySelector("#btn-clear-cache")
      .addEventListener("click", function () {
        var q = div.querySelector("#tmdb-search").value.trim();
        if (q) {
          delete apiCache["search_" + q];
        }
        Object.keys(apiCache).forEach(function (key) {
          if (key.startsWith("tv_") || key.startsWith("season_")) {
            delete apiCache[key];
          }
        });
        GM_setValue("tmdb_cache", JSON.stringify(apiCache));
        log("手动清除 TMDB 缓存（搜索词及所有电视数据）");
      });
    div.querySelector("#btn-search").addEventListener("click", function () {
      var q = div.querySelector("#tmdb-search").value.trim();
      state.pendingAutoSeason = null; // 清除自动选季状态
      performSearch(q, true);
    });

    function selectShow(id, showName) {
      var yearMatch = showName.match(/\((\d{4})\)/);
      state.tmdbShowTitle = showName.replace(/\s*\(\d{4}\)\s*$/, "").trim();
      state.tmdbShowYear = yearMatch ? yearMatch[1] : "";
      div.querySelector("#tmdb-episodes").innerHTML = "";
      div.querySelector("#tmdb-episodes").style.display = "none";
      setTmdbActionsVisible(false);
      getTVDetails(id, function (details) {
        var seasons = (details && details.seasons) || [];
        seasons.sort(function (a, b) {
          return a.season_number - b.season_number;
        });
        var pillsHtml = "";
        for (var i = 0; i < seasons.length; i++) {
          var sn = seasons[i].season_number;
          var label = sn === 0 ? "特别篇" : seasons[i].name || "第" + sn + "季";
          pillsHtml +=
            '<button class="season-pill" data-season="' +
            sn +
            '">' +
            label +
            "</button>";
        }
        var pillsRow = div.querySelector("#season-pills");
        pillsRow.innerHTML = pillsHtml;
        pillsRow.style.display = "flex";
        div.querySelector("#episode-select-all-label").style.display = "flex";
        setTmdbActionsVisible(true);

        var loadEpisodes = function (sn) {
          getSeasonEpisodes(id, sn, function (eps2) {
            var html2 = "";
            eps2.forEach(function (e) {
              var epName = e.name || "未知";
              var airDate = e.air_date || "";
              html2 +=
                '<div class="item" data-ep="' +
                e.episode_number +
                '" data-name="' +
                epName +
                '" data-air-date="' +
                airDate +
                '">' +
                '<span class="ep-meta">' +
                "E" +
                String(e.episode_number).padStart(2, "0") +
                "  " +
                (airDate || "???") +
                "</span>" +
                '<span class="ep-name" title="' +
                escapeHtml(epName) +
                '">' +
                epName +
                "</span>" +
                "</div>";
            });
            var hasEpisodes = eps2.length > 0;
            div.querySelector("#tmdb-episodes").innerHTML = hasEpisodes
              ? html2
              : "该季暂无剧集数据";
            div.querySelector("#tmdb-episodes").style.display = "block";
            setTmdbActionsVisible(hasEpisodes);

            var epMap = {};
            div
              .querySelectorAll("#tmdb-episodes .item")
              .forEach(function (item) {
                item.style.background = "#ccebff";
                epMap[item.dataset.ep] = item.dataset.ep;
              });

            var initAllItems = div.querySelectorAll("#tmdb-episodes .item");
            var initCb = div.querySelector("#btn-select-all");
            if (initCb) {
              initCb.checked =
                Object.keys(epMap).length === initAllItems.length &&
                initAllItems.length > 0;
              initCb.indeterminate = false;
            }

            div
              .querySelectorAll("#tmdb-episodes .item")
              .forEach(function (item) {
                item.addEventListener("click", function () {
                  var ep = this.dataset.ep;
                  if (epMap[ep]) {
                    delete epMap[ep];
                    this.style.background = "";
                  } else {
                    epMap[ep] = ep;
                    this.style.background = "#ccebff";
                  }
                  var allItems = div.querySelectorAll("#tmdb-episodes .item");
                  var selCount = Object.keys(epMap).length;
                  var cb = div.querySelector("#btn-select-all");
                  if (cb) {
                    cb.checked =
                      selCount === allItems.length && allItems.length > 0;
                    cb.indeterminate =
                      selCount > 0 && selCount < allItems.length;
                  }
                });
              });

            div.querySelector("#btn-select-all").onchange = function () {
              var allItems = div.querySelectorAll("#tmdb-episodes .item");
              if (this.checked) {
                allItems.forEach(function (item) {
                  var ep = item.dataset.ep;
                  epMap[ep] = ep;
                  item.style.background = "#ccebff";
                });
              } else {
                for (var key in epMap) {
                  if (epMap.hasOwnProperty(key)) delete epMap[key];
                }
                allItems.forEach(function (item) {
                  item.style.background = "";
                });
              }
            };

            div.querySelector("#btn-apply").onclick = function () {
              var activePill = div.querySelector(
                "#season-pills .season-pill.active",
              );
              var seasonNum = String(
                activePill ? activePill.dataset.season : "1",
              ).padStart(2, "0");

              var selectedEps = [];
              div
                .querySelectorAll("#tmdb-episodes .item")
                .forEach(function (item) {
                  if (epMap[item.dataset.ep]) {
                    selectedEps.push({
                      epNum: Number(item.dataset.ep),
                      name: item.dataset.name,
                    });
                  }
                });
              // 按集号升序排序
              selectedEps.sort(function (a, b) {
                return a.epNum - b.epNum;
              });
              var nextTargets = state.targetItems.map(function (x) {
                return { key: x.key, name: x.name };
              });
              var limit = Math.min(
                selectedEps.length,
                state.sourceItems.length,
              );
              for (var i = 0; i < limit; i++) {
                var ep = selectedEps[i];
                var source = state.sourceItems[i];
                var ext = getFileExt(source.name);
                var safeTitle = sanitizeFileName(ep.name);
                // 使用从 selectShow 获取的剧名和年份
                var newName = state.tmdbShowTitle;
                if (state.tmdbShowYear)
                  newName += " (" + state.tmdbShowYear + ")";
                newName +=
                  ".S" +
                  seasonNum +
                  "E" +
                  String(ep.epNum).padStart(2, "0") +
                  "." +
                  safeTitle;
                if (ext) newName += "." + ext;
                nextTargets[i] = { key: toId(source.id), name: newName };
              }

              state.targetItems = nextTargets;
              renderFiles();
            };
          });
        };

        // Bind pill click handlers
        pillsRow.querySelectorAll(".season-pill").forEach(function (pill) {
          pill.addEventListener("click", function () {
            pillsRow.querySelectorAll(".season-pill").forEach(function (p) {
              p.classList.remove("active");
            });
            this.classList.add("active");
            loadEpisodes(this.dataset.season);
          });
        });

        if (state.pendingAutoSeason !== null) {
          var targetSeason = state.pendingAutoSeason;
          state.pendingAutoSeason = null;
          var targetPill = pillsRow.querySelector(
            '.season-pill[data-season="' + targetSeason + '"]',
          );
          if (targetPill) {
            targetPill.click();
          }
        }
      });
    }

    function setTmdbActionsVisible(visible) {
      var label = div.querySelector("#episode-select-all-label");
      if (label) label.style.display = visible ? "flex" : "none";
      div.querySelector("#btn-apply").style.visibility = visible
        ? "visible"
        : "hidden";
    }

    async function doRename() {
      var todo = [];
      var dupCheck = new Set();
      var duplicated = new Set();
      var hasEmptyTarget = false;
      state.sourceItems.forEach(function (source, index) {
        var checked = state.selectedFileIds.has(toId(source.id));
        if (!checked) return;
        var target = state.targetItems[index] || { name: "" };
        var newName = (target.name || "").trim();
        if (!newName) {
          hasEmptyTarget = true;
          return;
        }
        if (newName === source.name) return;
        if (dupCheck.has(newName)) duplicated.add(newName);
        dupCheck.add(newName);
        todo.push({ id: source.id, name: newName });
      });
      if (hasEmptyTarget) {
        notify("存在空的新文件名，请先调整右侧列表", "error");
        return;
      }
      if (duplicated.size > 0) {
        notify(
          "存在重复的新文件名：" + Array.from(duplicated).join("，"),
          "error",
        );
        return;
      }
      if (todo.length === 0) {
        notify("没有需要重命名的文件", "error");
        return;
      }
      if (!(await confirmBox("确认重命名 " + todo.length + " 个文件?"))) return;
      runRenameQueue(todo);
    }

    function runRenameQueue(todo) {
      var btn = div.querySelector("#btn-rename");
      var running = true;
      var maxConcurrent = 3;
      var delayMs = 200;
      var done = 0;
      var failed = 0;
      btn.disabled = true;
      btn.textContent = "重命名中 0/" + todo.length;

      function sleep(ms) {
        return new Promise(function (resolve) {
          setTimeout(resolve, ms);
        });
      }

      function renamePromise(item) {
        return new Promise(function (resolve) {
          renameFile(item.id, item.name, function (r) {
            var ok = !!(
              r &&
              (r.code === 0 || r.status === 0 || r.success === true)
            );
            resolve(ok);
          });
        });
      }

      (async function () {
        var queue = todo.slice();
        while (running && queue.length) {
          var subQueue = [];
          for (var i = 0; i < maxConcurrent; i++) {
            var next = queue.shift();
            if (!next) break;
            subQueue.push(next);
          }
          await Promise.all(
            subQueue.map(async function (item) {
              var ok = await renamePromise(item);
              if (!ok) failed++;
              done++;
              btn.textContent = "重命名中 " + done + "/" + todo.length;
            }),
          );
          if (queue.length) await sleep(delayMs);
        }
        running = false;
        btn.disabled = false;
        btn.textContent = "开始重命名";
        notify(
          "完成：" + done + " 个，失败：" + failed + " 个",
          done > 0 && failed > 0 ? "error" : "success",
        );
        setTimeout(function () {
          location.reload();
        }, 1500);
      })().catch(function (e) {
        err("重命名异常:", e && e.message);
        btn.disabled = false;
        btn.textContent = "开始重命名";
        notify("重命名异常，请重试", "error");
      });
    }

    div.querySelector("#btn-rename").addEventListener("click", doRename);

    function resetTMDBSection() {
      var searchInput = div.querySelector("#tmdb-search");
      if (searchInput) searchInput.value = "";
      var results = div.querySelector("#tmdb-results");
      if (results) results.innerHTML = "";
      var pillsRow = div.querySelector("#season-pills");
      if (pillsRow) {
        pillsRow.innerHTML = "";
        pillsRow.style.display = "none";
      }
      var label = div.querySelector("#episode-select-all-label");
      if (label) label.style.display = "none";
      var episodes = div.querySelector("#tmdb-episodes");
      if (episodes) {
        episodes.innerHTML = "";
        episodes.style.display = "none";
      }
      div.querySelector("#btn-apply").style.visibility = "hidden";
      // 重置相关状态
      state.tmdbShowTitle = "";
      state.tmdbShowYear = "";
      state.pendingAutoSeason = null;
      // 移除 TMDB 搜索结果项的选中类
      div.querySelectorAll("#tmdb-results .item").forEach(function (x) {
        x.classList.remove("selected");
      });
    }
  }

  // ========== 单文件夹重命名弹窗 ==========
  function injectFolderRenameButtons() {
    document.addEventListener("mouseover", function (e) {
      var row = e.target.closest("tr[pathname]");
      if (!row) return;
      var operList = row.querySelector(".hover-oper-list");
      if (!operList) return;
      var fid = row.getAttribute("data-row-key");
      var nameEl = row.querySelector(".filename-text");
      var folderName = nameEl ? nameEl.textContent.trim() : "";

      // 每次都检查并注入（React 重渲染会移除）
      var existing = operList.querySelector(".hoitem-ai-rename");
      if (existing) {
        existing._fid = fid;
        existing._folderName = folderName;
        return;
      }

      var btn = document.createElement("div");
      btn.className = "hover-oper-item hoitem-ai-rename";
      btn.title = "AI 重命名";
      btn.style.cssText =
        'background-image:url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2724%27 height=%2724%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27%23f0a030%27 stroke-width=%271.5%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27%3E%3Cpath d=%27M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5z%27/%3E%3Cpath d=%27M18 14l.8 3.2L22 18l-3.2.8L18 22l-.8-3.2L14 18l3.2-.8z%27/%3E%3C/svg%3E");background-size:20px 20px;background-position:center;background-repeat:no-repeat;';
      btn._fid = fid;
      btn._folderName = folderName;
      btn.addEventListener("click", function (ev) {
        ev.stopPropagation();
        ev.preventDefault();
        showFolderRenameDialog(btn._fid, btn._folderName);
      });

      var firstBtn = operList.querySelector(".hoitem-down");
      if (firstBtn) {
        operList.insertBefore(btn, firstBtn);
      } else {
        operList.appendChild(btn);
      }
    });
  }

  function showFolderRenameDialog(fid, folderName) {
    var existing = document.getElementById("folder-rename-dialog");
    if (existing) existing.remove();

    var overlay = document.createElement("div");
    overlay.id = "folder-rename-dialog";
    overlay.style.cssText =
      "position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:999998;display:flex;align-items:center;justify-content:center;";
    overlay.addEventListener("mousedown", function (e) {
      e.stopPropagation();
    });

    var videoExts =
      "mkv|mp4|avi|mov|wmv|flv|webm|m4v|mpg|mpeg|ts|rmvb|m2ts|ogv|divx|xvid|3gp|vob|mts";
    var srcExt = "";
    var dotIdx = folderName.lastIndexOf(".");
    if (dotIdx > -1) {
      var ext = folderName.slice(dotIdx + 1).toLowerCase();
      if (videoExts.indexOf(ext) !== -1) srcExt = "." + ext;
    }

    var box = document.createElement("div");
    box.style.cssText =
      "background:#fff;border-radius:12px;padding:20px 24px;width:520px;max-height:80vh;display:flex;flex-direction:column;box-shadow:0 4px 20px rgba(0,0,0,.3);font-family:system-ui,sans-serif;";

    box.innerHTML =
      "" +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">' +
      '<h3 style="margin:0;font-size:16px;color:#333;">文件夹重命名</h3>' +
      '<button id="folder-dlg-close" style="width:30px;height:30px;display:flex;align-items:center;justify-content:center;background:none;border:none;font-size:20px;cursor:pointer;color:#999;padding:0;">&times;</button>' +
      "</div>" +
      '<label style="font-size:12px;color:#999;margin-bottom:4px;">源文件名</label>' +
      '<input id="folder-dlg-source" type="text" value="' +
      folderName.replace(/"/g, "&quot;") +
      '" readonly style="width:100%;padding:8px 10px;border:1px solid #e0e0e0;border-radius:6px;background:#f5f5f5;color:#999;font-size:13px;margin-bottom:12px;">' +
      '<label style="font-size:12px;color:#999;margin-bottom:4px;">目标文件名</label>' +
      '<input id="folder-dlg-target" type="text" placeholder="应用后将填入这里" style="width:100%;padding:8px 10px;border:1px solid #ddd;border-radius:6px;font-size:13px;margin-bottom:12px;">' +
      '<div style="display:flex;align-items:stretch;margin-bottom:8px;">' +
      '<button id="folder-dlg-ai" title="AI 识别剧名" style="width:38px;height:38px;padding:0;border:1px solid #ddd;border-radius:6px 0 0 6px;background:#fff;cursor:pointer;flex-shrink:0;font-size:16px;"' +
      " onmouseover=\"this.style.background='#0a8c0899';this.style.borderColor='#c3d5f0';\" onmouseout=\"this.style.background='#fff';this.style.borderColor='#ddd';\">✨</button>" +
      '<input id="folder-dlg-search" type="text" placeholder="搜索剧集名称" style="flex:1;height:38px;padding:0 10px;font-size:14px;border:1px solid #ddd;border-left:none;border-right:none;border-radius:0;outline:none;">' +
      '<button id="folder-dlg-search-btn" title="搜索" style="width:36px;height:38px;padding:0;border:1px solid #4a90e2;border-radius:0 6px 6px 0;background:#4a90e2;cursor:pointer;flex-shrink:0;display:flex;align-items:center;justify-content:center;">' +
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>' +
      "</button>" +
      "</div>" +
      '<div id="folder-dlg-results" style="flex:1;min-height:0;max-height:300px;overflow-y:auto;border:1px solid #eee;border-radius:6px;margin-bottom:12px;font-size:13px;"></div>' +
      '<div style="display:flex;gap:12px;justify-content:flex-end;">' +
      '<button id="folder-dlg-cancel" style="width:auto;padding:8px 20px;background:#eee;color:#333;border:none;border-radius:6px;cursor:pointer;font-size:14px;margin-bottom:0;">取消</button>' +
      '<button id="folder-dlg-apply" style="width:auto;padding:8px 20px;background:#4a90e2;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px;margin-bottom:0;">应用修改</button>' +
      "</div>";

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    // Close handlers
    function closeDialog() {
      overlay.remove();
      notifyQueue = [];
      if (notifyTimer) {
        clearTimeout(notifyTimer);
        notifyTimer = null;
      }
    }
    box.querySelector("#folder-dlg-close").onclick = closeDialog;
    box.querySelector("#folder-dlg-cancel").onclick = closeDialog;
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) closeDialog();
    });
    var escHandler = function (e) {
      if (
        e.key === "Escape" &&
        !e.isComposing &&
        document.activeElement.tagName !== "INPUT"
      ) {
        closeDialog();
        document.removeEventListener("keydown", escHandler);
      }
    };
    document.addEventListener("keydown", escHandler);

    // Hover 样式：避免被夸克全局 CSS 覆盖
    var cancelBtn = box.querySelector("#folder-dlg-cancel");
    cancelBtn.addEventListener("mouseenter", function () {
      this.style.background = "#ddd";
    });
    cancelBtn.addEventListener("mouseleave", function () {
      this.style.background = "#eee";
    });
    var applyBtn = box.querySelector("#folder-dlg-apply");
    applyBtn.addEventListener("mouseenter", function () {
      this.style.background = "#357abd";
    });
    applyBtn.addEventListener("mouseleave", function () {
      this.style.background = "#4a90e2";
    });

    // TMDB search and render
    function doFolderSearch(query, onComplete) {
      if (!query) return;
      box.querySelector("#folder-dlg-search").value = query;
      var key = getApiKey();
      if (!key) {
        notify("请先设置TMDB API Key", "error");
        return;
      }
      searchTMDB(query, function (results) {
        var html = "";
        results.forEach(function (r) {
          var year = (r.first_air_date || r.release_date || "").slice(0, 4);
          var title = r.name || r.title;
          var typeLabel = r.tmdbType === "tv" ? "TV" : "M";
          html +=
            '<div class="folder-result-item" data-name="' +
            title.replace(/"/g, "&quot;") +
            '" data-year="' +
            year +
            '" style="padding:8px 10px;border-bottom:1px solid #f5f5f5;cursor:pointer;display:flex;align-items:center;gap:8px;font-size:13px;">' +
            '<span style="display:inline-block;width:24px;height:16px;line-height:16px;text-align:center;font-size:10px;border-radius:3px;color:#fff;background:' +
            (r.tmdbType === "tv" ? "#4a90e2" : "#28a745") +
            ';flex-shrink:0;">' +
            typeLabel +
            "</span>" +
            (r.poster_path
              ? '<img src="https://image.tmdb.org/t/p/w92' +
                r.poster_path +
                '" style="width:28px;height:42px;object-fit:cover;border-radius:2px;flex-shrink:0;">'
              : "") +
            '<span style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' +
            title +
            "</span>" +
            (year
              ? '<span style="color:#999;font-size:12px;flex-shrink:0;">' +
                year +
                "</span>"
              : "") +
            "</div>";
        });
        var resultsDiv = box.querySelector("#folder-dlg-results");
        resultsDiv.innerHTML =
          html ||
          '<div style="padding:8px;color:#999;text-align:center;">无结果</div>';
        resultsDiv
          .querySelectorAll(".folder-result-item")
          .forEach(function (item) {
            item.addEventListener("click", function () {
              resultsDiv
                .querySelectorAll(".folder-result-item")
                .forEach(function (x) {
                  x.style.background = "";
                });
              this.style.background = "#e6f7ff";
              var name = this.dataset.name;
              var year = this.dataset.year;
              box.querySelector("#folder-dlg-target").value =
                name + (year ? " (" + year + ")" : "") + srcExt;
            });
          });
        // 自动选中第一个结果
        var firstItem = resultsDiv.querySelector(".folder-result-item");
        if (firstItem) firstItem.click();
        if (typeof onComplete === "function") onComplete();
      });
    }

    // AI 识别（force=true 强制重新识别，不走缓存）
    function doAIRecognize(force) {
      var cfg = getAIConfig();
      if (!cfg.apiKey) {
        notify("AI 自动识别错误，请手动执行", "error");
        return;
      }
      var cacheKey = "folder_" + folderName;
      if (!force) {
        var cached = aiTitleCache[cacheKey];
        if (cached) {
          notify("🤖 正在 AI 识别...", "info");
          doFolderSearch(cached.value, function () {
            notify("AI 自动识别完成", "success");
          });
          return;
        }
      } else {
        delete aiTitleCache[cacheKey];
      }
      notify("🤖 正在 AI 识别...", "info");
      var ai = new OpenAICompatible({
        baseURL: cfg.baseURL,
        apiKey: cfg.apiKey,
        model: cfg.model,
      });
      var prompt =
        "你是影视剧信息专家。输入文件名，若只输入“第x季”，直接输出Sxx（如第一季=>S01、第五季=>S05），否则输出“剧名|1”，季数不明填1，优先中文，禁止解释、年份。输入：" +
        folderName;
      ai.chat(prompt)
        .then(function (result) {
          var cleaned = result
            .trim()
            .replace(/^["']|["']$/g, "")
            .trim();
          var parts = cleaned.split("|");
          var showName = parts[0].trim();
          if (!showName) throw new Error("AI 返回空");
          aiTitleCache[cacheKey] = { value: showName, time: Date.now() };
          GM_setValue("ai_title_cache", JSON.stringify(aiTitleCache));
          doFolderSearch(showName, function () {
            notify("AI 自动识别完成", "success");
          });
        })
        .catch(function () {
          notify("AI 自动识别错误，请手动执行", "error");
        });
    }

    // AI 识别按钮 — 手动点击，强制重新识别
    box.querySelector("#folder-dlg-ai").addEventListener("click", function () {
      doAIRecognize(true);
    });

    // Search button
    box
      .querySelector("#folder-dlg-search-btn")
      .addEventListener("click", function () {
        doFolderSearch(box.querySelector("#folder-dlg-search").value.trim());
      });

    // Search on Enter
    box
      .querySelector("#folder-dlg-search")
      .addEventListener("keydown", function (e) {
        if (e.key === "Enter") doFolderSearch(this.value.trim());
      });

    // Apply button
    box
      .querySelector("#folder-dlg-apply")
      .addEventListener("click", async function () {
        var newName = box.querySelector("#folder-dlg-target").value.trim();
        if (!newName) {
          notify("请填入目标文件名", "error");
          return;
        }
        var applyBtn = box.querySelector("#folder-dlg-apply");
        applyBtn.disabled = true;
        applyBtn.textContent = "修改中...";
        try {
          var resp = await fetch(
            "https://drive-pc.quark.cn/1/clouddrive/file/rename?pr=ucpro&fr=pc&uc_param_str=",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ fid: fid, file_name: newName }),
            },
          );
          var data = await resp.json();
          if (data && (data.code === 0 || data.status === 0)) {
            notify("✅ 修改完成: " + newName, "success");
            setTimeout(function () {
              overlay.remove();
              location.reload();
            }, 1500);
          } else {
            notify("❌ 修改失败", "error");
            applyBtn.disabled = false;
            applyBtn.textContent = "应用修改";
          }
        } catch (e) {
          notify("❌ 请求失败: " + e.message, "error");
          applyBtn.disabled = false;
          applyBtn.textContent = "应用修改";
        }
      });

    // Auto-trigger AI on open（走缓存）
    setTimeout(function () {
      doAIRecognize(false);
    }, 300);
  }

  injectFolderRenameButtons();

  // 初始化
  function init() {
    console.log("[云盘重命名TMDB] 开始初始化");
    console.log("[云盘重命名TMDB] hostname:", location.host);
    console.log("[云盘重命名TMDB] readyState:", document.readyState);
    createToolbarButton();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
