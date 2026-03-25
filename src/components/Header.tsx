import { useState } from 'react';
import './header.css';

export default function Header() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <header>
        <div>
          <h1>Still <span>Whaling</span></h1>
          <div className="subtitle">Who's still hunting whales?</div>
        </div>
        <button className="about-btn" onClick={() => setOpen(true)}>About</button>
      </header>

      <div className={`about-dialog${open ? ' visible' : ''}`} onClick={e => { if ((e.target as HTMLElement).classList.contains('about-dialog')) setOpen(false); }}>
        <div className="about-dialog-content">
          <button className="about-close" onClick={() => setOpen(false)}>×</button>
          <h2>About</h2>
          <p>Interactive visualization of global whaling data showing which countries are still hunting whales.</p>
          <div className="about-links">
            <div className="about-link-section">
              <h3>Data Source</h3>
              <a href="https://iwc.int/management-and-conservation/whaling/total-catches" target="_blank" rel="noopener noreferrer">
                IWC Total Catches Database
              </a>
            </div>
            <div className="about-link-section">
              <h3>Inspiration</h3>
              <a href="https://youtu.be/rTgwZR3T_uo" target="_blank" rel="noopener noreferrer" className="inspiration-link">
                <div className="video-title">Whale Hunting Was Absolutely Crazy</div>
                <div className="video-meta">by Nightshift – Kurzgesagt After Dark (Jan 30, 2026)</div>
              </a>
            </div>
            <div className="about-link-section">
              <h3>Author</h3>
              <div className="about-author">Jan Czechowski 2026</div>
              <a href="https://janczechowski.com" target="_blank" rel="noopener noreferrer">
                janczechowski.com
              </a>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
