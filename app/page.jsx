"use client";
import { useEffect, useState } from "react";

const wings = [
  { n: "01", name: "THE ATRIUM", detail: "A little room for everything", tone: "rose", department: "Fashion" },
  { n: "02", name: "THE GALLERIES", detail: "Discover your next favourite", tone: "green", department: "Electronics" },
  { n: "03", name: "THE TERRACE", detail: "Make a day of it", tone: "gold", department: "Home & Living" },
];
export default function Landing() {
  const [ready, setReady] = useState(false);
  const [menu, setMenu] = useState(false);
  const [videoDebug, setVideoDebug] = useState(false);
  const [videoStats, setVideoStats] = useState(null);
  useEffect(() => { const t = window.setTimeout(() => setReady(true), 120); return () => window.clearTimeout(t); }, []);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("video-debug") !== "1") return;
    setVideoDebug(true);
    const video = document.querySelector(".arrival-hero-video");
    if (!video) {
      setVideoStats({ detected: false });
      return;
    }
    const errorMessages = {
      1: "MEDIA_ERR_ABORTED — loading aborted",
      2: "MEDIA_ERR_NETWORK — network error",
      3: "MEDIA_ERR_DECODE — decoding failed",
      4: "MEDIA_ERR_SRC_NOT_SUPPORTED — source unsupported"
    };
    const update = (eventName) => {
      const rect = video.getBoundingClientRect();
      setVideoStats({
        detected: true,
        readyState: video.readyState,
        paused: video.paused,
        currentTime: Number.isFinite(video.currentTime) ? video.currentTime : 0,
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
        renderedWidth: Math.round(rect.width),
        renderedHeight: Math.round(rect.height),
        errorCode: video.error?.code ?? 0,
        errorMessage: video.error ? (video.error.message || errorMessages[video.error.code] || "Unknown media error") : "None",
        event: eventName || "Polling"
      });
    };
    const events = ["loadedmetadata", "loadeddata", "canplay", "play", "playing", "pause", "waiting", "stalled", "error", "timeupdate"];
    const handlers = events.map((name) => {
      const handler = () => update(name);
      video.addEventListener(name, handler);
      return [name, handler];
    });
    update("Mounted");
    const timer = window.setInterval(() => update("Polling"), 500);
    return () => {
      window.clearInterval(timer);
      handlers.forEach(([name, handler]) => video.removeEventListener(name, handler));
    };
  }, []);
  return <main className={"arrival " + (ready ? "arrival-ready" : "")}>
    <div className="arrival-grain" aria-hidden="true" />
    <header className="arrival-nav">
      <a className="arrival-brand" href="/" aria-label="Chucks Shopping Mall home"><img className="arrival-brand-mark" src="/assets/chucks-logo.png" alt="" aria-hidden="true"/><b>CHUCKS<small>SHOPPING MALL · LOKOJA</small></b></a>
      <div className="arrival-nav-links"><a href="#architecture">THE MALL</a><a href="#discover">DISCOVER</a><a href="#visit-chucks">FIND US</a></div>
      <a className="arrival-nav-cta" href="/shop">ENTER STORE <span>↗</span></a>
      <button className="arrival-menu" onClick={() => setMenu(!menu)} aria-label="Toggle navigation">{menu ? "×" : "☰"}</button>
    </header>
    {menu && <nav className="arrival-mobile-menu"><a href="#architecture" onClick={() => setMenu(false)}>The mall</a><a href="#discover" onClick={() => setMenu(false)}>Discover</a><a href="/shop">Enter store ↗</a></nav>}
    <section className="arrival-hero" id="architecture">
      <video className="arrival-hero-video" autoPlay muted loop playsInline preload="metadata" poster="/assets/chucks-mall-poster.svg" aria-hidden="true" tabIndex={-1}><source src="/assets/chucks-mall-hero.mp4" type="video/mp4" /></video>
      {videoDebug && <aside aria-live="polite" style={{ position: "fixed", right: 8, bottom: "max(8px, env(safe-area-inset-bottom))", zIndex: 9999, width: "min(250px, calc(100vw - 16px))", padding: "9px 11px", border: "1px solid rgba(255,255,255,.24)", borderRadius: 9, background: "rgba(12,14,18,.88)", color: "#f5f3f2", font: "10px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace", boxShadow: "0 4px 18px rgba(0,0,0,.28)", pointerEvents: "none" }}>
        <div style={{ font: "700 10px/1.4 Arial,sans-serif", letterSpacing: ".08em", marginBottom: 5, color: "#f2a4ce" }}>VIDEO DIAGNOSTICS · LIVE</div>
        {videoStats ? <>
          <div>Element: <b>{videoStats.detected ? "DETECTED" : "NOT FOUND"}</b></div>
          {videoStats.detected && <>
            <div>readyState: <b>{videoStats.readyState}</b> (0–4)</div>
            <div>Status: <b>{videoStats.paused ? "PAUSED" : "PLAYING"}</b></div>
            <div>currentTime: <b>{videoStats.currentTime.toFixed(2)}s</b></div>
            <div>Video: <b>{videoStats.videoWidth} × {videoStats.videoHeight}</b></div>
            <div>Rendered: <b>{videoStats.renderedWidth} × {videoStats.renderedHeight}px</b></div>
            <div>Error: <b>{videoStats.errorCode || "None"}</b></div>
            <div style={{ overflowWrap: "anywhere", color: videoStats.errorCode ? "#ff9a9a" : "#c8c2c5" }}>{videoStats.errorMessage}</div>
            <div style={{ marginTop: 4, color: "#aaa2a7" }}>Last event: {videoStats.event}</div>
          </>}
        </> : <div>Reading video element…</div>}
      </aside>}
      <div className="arrival-orbit orbit-one" /><div className="arrival-orbit orbit-two" />
      <div className="arrival-coordinate">07°48' N&nbsp;&nbsp; 06°44' E <i /> LOKOJA, NIGERIA</div>
      <div className="arrival-copy">
        <div className="arrival-logo-reveal" aria-label="Chucks Shopping Mall logo"><img src="/assets/chucks-logo.svg" alt="Chucks Shopping Mall logo" /></div>
        <div className="arrival-kicker"><span /> A NEW LANDMARK FOR EVERYDAY DISCOVERY</div>
        <h1>More than<br />a place to <em>shop.</em></h1>
        <p>A world of little discoveries, unexpected favourites and good days — all under one roof.</p>
        <div className="arrival-actions"><a className="arrival-primary" href="/shop">ENTER THE MALL <span>↗</span></a><a className="arrival-secondary" href="#discover">EXPLORE THE EXPERIENCE <span>↓</span></a></div>
      </div>
      <div className="architecture" aria-label="A stylised architectural rendering of the Chucks Shopping Mall entrance">
        <div className="architecture-halo" />
        <div className="arch-floor floor-back" /><div className="arch-floor floor-front" />
        <div className="mall-building">
          <div className="roof-cap"><span>CHUCKS</span><i>✳</i></div>
          <div className="roof-line" />
          <div className="upper-volume"><div className="upper-window"><i/><i/><i/><i/></div><div className="upper-sign">A PLACE TO DISCOVER</div></div>
          <div className="colonnade"><i/><i/><i/><i/><i/><i/></div>
          <div className="glass-lobby"><div className="lobby-light"/><div className="lobby-stairs"/><div className="lobby-plants">✳</div><a className="entry-portal" href="/shop" aria-label="Enter Chucks Shopping Mall"><span>COME ON IN</span><b>c.</b><small className="portal-enter">OPEN THE DOORS ↗</small></a></div>
          <div className="mall-plinth"><span>CHUCKS SHOPPING MALL</span><span>LOKOJA · NIGERIA</span></div>
        </div>
        <div className="architecture-shadow" />
        <div className="floating-marker marker-a"><b>01</b><span>THE ATRIUM</span></div>
        <div className="floating-marker marker-b"><b>✳</b><span>OPEN TO DISCOVERY</span></div>
      </div>
      <div className="hero-bottomline"><span>DESIGNED FOR THE EVERYDAY EXTRAORDINARY</span><span>SCROLL TO TAKE A CLOSER LOOK&nbsp; ↓</span><span>01 / 03</span></div>
      <div className="vertical-note">A NEW WAY TO EXPERIENCE CHUCKS</div>
    </section>
    <section className="arrival-intro" id="discover">
      <div className="intro-index">01 — THE IDEA</div>
      <div className="intro-content"><p className="intro-overline">A LITTLE BIT OF EVERYTHING. A WHOLE LOT TO DISCOVER.</p><h2>Come for one thing.<br /><em>Leave with a story.</em></h2><p className="intro-description">Chucks is imagined as more than a collection of shops. It is a place to wander, find something you didn't know you needed, meet your people and make an ordinary day feel a little more interesting.</p><a href="/shop" className="intro-link">TAKE A LOOK INSIDE <span>↗</span></a></div>
      <div className="intro-stamp"><span>THE CHUCKS<br/>EXPERIENCE</span><b>✳</b><small>LOKOJA · EST. IN THE MAKING</small></div>
    </section>
    <section className="arrival-wings">
      <div className="wings-heading"><div><span className="arrival-kicker"><span/> THE MALL, IN THREE MOMENTS</span><h2>Room to<br/><em>find your thing.</em></h2></div><p>Every visit starts somewhere. Take a first look at the spaces and moments that make up the Chucks experience.</p></div>
      <div className="wing-grid">{wings.map((w)=><a className={"wing-card wing-"+w.tone} key={w.n} href={"/shop?department="+encodeURIComponent(w.department)+"#picks"} aria-label={"Explore "+w.department}><div className="wing-art"><div className="wing-arch"><div/><i/><b>{w.n}</b></div><span className="wing-orbit">✳</span><span className="wing-enter">ENTER DEPARTMENT ↗</span></div><div className="wing-meta"><span>{w.n} / 03</span><span>{w.department.toUpperCase()}</span></div><h3>{w.name}</h3><p>{w.detail}</p></a>)}</div>
    </section>
    <section className="arrival-invitation" id="visit-chucks"><div className="invitation-orb"/><div className="invitation-copy"><span className="arrival-kicker"><span/> YOUR NEXT DISCOVERY STARTS HERE</span><h2>Shall we<br/><em>step inside?</em></h2><p>Explore the store, wander through the collections and see what catches your eye.</p><a href="/shop" className="arrival-primary">ENTER CHUCKS <span>↗</span></a></div><a className="invitation-door" href="/shop" aria-label="Walk through the Chucks entrance and enter the store"><div className="door-frame"><div className="door-glass"><span>c.</span><small>WELCOME IN</small></div><div className="door-glass second"/></div><div className="door-step"/></a><div className="invitation-foot"><span>CHUCKS SHOPPING MALL · LOKOJA, NIGERIA</span><span>THE DOORS TO DISCOVERY ARE OPEN ↗</span></div></section>
    <footer className="arrival-footer"><a className="arrival-brand" href="/"><img className="arrival-brand-mark" src="/assets/chucks-logo.png" alt="" aria-hidden="true"/><b>CHUCKS<small>SHOPPING MALL · LOKOJA</small></b></a><div className="arrival-footer-links"><a href="#architecture">BACK TO TOP ↑</a><a href="/shop">ENTER STORE ↗</a></div><p>A LITTLE BIT OF EVERYTHING. A WHOLE LOT TO DISCOVER.</p><div className="arrival-legal"><span>© 2026 CHUCKS SHOPPING MALL</span><span>VISUAL PROTOTYPE · SAMPLE EXPERIENCE</span><span>LOKOJA, NIGERIA</span></div><div className="arrival-credit">DESIGNED &amp; DEVELOPED BY <a href="https://github.com/suleiman2799-svg" target="_blank" rel="noreferrer">suleiman_cr7</a></div>
    </footer>
  </main>;
}