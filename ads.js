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
  let scheduled = false;

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
    if(observer){ observer.disconnect(); observer = null; }
    window.removeEventListener("resize", scheduleSync);
    clearDockMeasurement();
    body.classList.remove("ads-enabled");
    root.style.removeProperty("--ad-slot-content-height");
    if(slot){ slot.hidden = true; slot.removeAttribute("data-provider"); }
  }

  function enable(){
    disable();
    if(!slot || !content || config.enabled !== true || config.position !== "bottom"){
      return;
    }
    const height = Number(config.contentHeight);
    if(!Number.isFinite(height) || height < 30 || height > 120) throw new Error("Chiều cao Ad Slot không hợp lệ.");

    root.style.setProperty("--ad-slot-content-height", `${Math.round(height)}px`);
    slot.dataset.provider = String(config.provider || "placeholder");
    slot.hidden = false;
    body.classList.add("ads-enabled");

    // Prototype 01 chỉ dựng vùng dành chỗ. AdSense thật sẽ thay nội dung này ở Prototype 02.
    content.textContent = String(config.placeholderText || "VỊ TRÍ QUẢNG CÁO");

    observer = new MutationObserver(scheduleSync);
    observer.observe(document.getElementById("app") || body, {childList:true, subtree:true});
    window.addEventListener("resize", scheduleSync, {passive:true});
    scheduleSync();
  }

  window.AppAds = Object.freeze({
    config,
    enable: () => { try{ enable(); }catch(error){ console.warn("Ads disabled:", error); disable(); } },
    disable
  });

  try{ enable(); }
  catch(error){
    console.warn("Ads disabled:", error);
    disable();
  }
})();
