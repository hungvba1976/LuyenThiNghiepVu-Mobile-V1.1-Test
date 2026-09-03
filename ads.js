"use strict";

// Lớp quảng cáo độc lập: không gọi và không thay đổi logic Practice/Exam.
// Mọi lỗi tại đây đều được thu hồi về trạng thái không quảng cáo.
(() => {
  const root = document.documentElement;
  const body = document.body;
  const slot = document.getElementById("ad-bottom-slot");
  const content = document.getElementById("ad-bottom-content");
  const config = window.ADS_CONFIG || {};
  let observer = null;
  let resizeObserver = null;
  let adResizeObserver = null;
  let adMutationObserver = null;
  let scheduled = false;
  let active = false;

  function maxAdHeight(){
    const configured = Number(config.maxHeight);
    return Number.isFinite(configured) ? Math.max(0,Math.min(50,Math.round(configured))) : 50;
  }

  function applyRenderedHeight(rawHeight){
    if(!active || !slot) return;
    const numeric = Number(rawHeight);
    const height = Number.isFinite(numeric) ? Math.max(0,Math.min(maxAdHeight(),Math.ceil(numeric))) : 0;
    root.style.setProperty("--ad-slot-content-height", `${height}px`);
    slot.dataset.renderedHeight = String(height);
    slot.classList.toggle("ad-slot-empty",height===0);
    body.classList.toggle("ads-enabled", height>0);
    scheduleSync();
  }

  function clearAdMeasurement(){
    if(adResizeObserver){ adResizeObserver.disconnect(); adResizeObserver = null; }
    if(adMutationObserver){ adMutationObserver.disconnect(); adMutationObserver = null; }
  }

  function renderedAdElement(){
    return content?.querySelector("[data-ad-rendered]") || content?.firstElementChild || null;
  }

  function measureRenderedAd(){
    const rendered = renderedAdElement();
    if(!rendered){ applyRenderedHeight(0); return; }
    const rectHeight = rendered.getBoundingClientRect().height;
    const attrHeight = Number(rendered.getAttribute?.("height"));
    applyRenderedHeight(rectHeight || attrHeight || 0);
  }

  function bindRenderedAdMeasurement(){
    const rendered = renderedAdElement();
    if(adResizeObserver){ adResizeObserver.disconnect(); adResizeObserver = null; }
    measureRenderedAd();
    if(!rendered) return;
    if(window.ResizeObserver){
      adResizeObserver = new ResizeObserver(measureRenderedAd);
      adResizeObserver.observe(rendered);
    }
  }

  function clearDockMeasurement(){
    root.style.removeProperty("--setup-dock-height");
    if(resizeObserver){
      resizeObserver.disconnect();
      resizeObserver = null;
    }
  }

  function syncFixedControls(){
    scheduled = false;
    clearDockMeasurement();
    const dock = document.querySelector(".setup-action-dock");
    if(!dock) return;
    const update = () => root.style.setProperty("--setup-dock-height", `${Math.ceil(dock.getBoundingClientRect().height)}px`);
    update();
    if(window.ResizeObserver){
      resizeObserver = new ResizeObserver(update);
      resizeObserver.observe(dock);
    }
  }

  function scheduleSync(){
    if(scheduled) return;
    scheduled = true;
    requestAnimationFrame(syncFixedControls);
  }

  function disable(){
    active = false;
    if(observer){ observer.disconnect(); observer = null; }
    window.removeEventListener("resize", scheduleSync);
    clearAdMeasurement();
    clearDockMeasurement();
    body.classList.remove("ads-enabled");
    root.style.removeProperty("--ad-slot-content-height");
    if(slot){ slot.hidden = true; slot.classList.remove("ad-slot-empty"); slot.removeAttribute("data-provider"); slot.removeAttribute("data-rendered-height"); }
  }

  function enable(){
    disable();
    if(!slot || !content || config.enabled !== true || config.position !== "bottom"){
      return;
    }
    if(maxAdHeight()<=0) return;
    active = true;
    slot.dataset.provider = String(config.provider || "placeholder");
    slot.hidden = false;

    if(config.provider === "placeholder"){
      content.textContent = String(config.placeholderText || "VỊ TRÍ QUẢNG CÁO");
      applyRenderedHeight(Number(config.placeholderHeight) || maxAdHeight());
    }else{
      // Provider thật chèn phần tử quảng cáo vào #ad-bottom-content. Vùng chứa
      // bắt đầu ở 0 px rồi tự co/giãn theo mẫu quảng cáo, không vượt quá 50 px.
      content.textContent = "";
      applyRenderedHeight(0);
      adMutationObserver = new MutationObserver(bindRenderedAdMeasurement);
      adMutationObserver.observe(content,{childList:true,subtree:true,attributes:true,attributeFilter:["style","height"]});
      bindRenderedAdMeasurement();
    }

    observer = new MutationObserver(scheduleSync);
    observer.observe(document.getElementById("app") || body, {childList:true, subtree:true});
    window.addEventListener("resize", scheduleSync, {passive:true});
    scheduleSync();
  }

  window.AppAds = Object.freeze({
    config,
    enable: () => { try{ enable(); }catch(error){ console.warn("Ads disabled:", error); disable(); } },
    disable,
    // Điểm nối dành cho provider thật nếu provider biết chính xác chiều cao creative.
    setRenderedHeight: applyRenderedHeight
  });

  try{ enable(); }
  catch(error){
    console.warn("Ads disabled:", error);
    disable();
  }
})();
