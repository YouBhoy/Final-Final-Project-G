import { Link } from 'react-router-dom';
import { ANDROID_RELEASE } from '../../lib/androidDownload';
import '../../styles/android-download.css';

export function AndroidDownloadButton() {
  return <a className="android-download-button" href={ANDROID_RELEASE.url} target="_blank" rel="noopener noreferrer" aria-label="Download for Android (opens Google Drive in a new tab)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4" /></svg><span>Download for Android</span><span className="android-link-arrow" aria-hidden="true">↗</span></a>;
}

export function AndroidCompanionArtwork() {
  return <div className="android-companion-art" aria-hidden="true"><div className="android-art-orbit" /><div className="android-phone"><div className="android-phone-camera" /><div className="android-phone-brand"><span className="android-brand-dot">S</span><span>SPARTAN-G<small>YOUR STUDENT SPACE</small></span></div><p className="android-phone-greeting">A little support.<br /><strong>A way forward.</strong></p><div className="android-phone-lines"><span>Messages <i>↗</i></span><span>Appointments <i>↗</i></span><span>Your Garden <i>✦</i></span></div><div className="android-phone-home" /></div><img className="android-spartan" src="/red-spartan-wave.png" alt="" width="1145" height="1374" loading="lazy" decoding="async" /><span className="android-art-note"><span>✦</span> Your next step, together.</span></div>;
}

export function AndroidDownloadSection() {
  return <section className="android-promo" aria-labelledby="android-promo-title" id="android-app"><div className="android-promo-copy"><p className="android-kicker"><span /> YOUR CAMPUS COMPANION</p><h2 id="android-promo-title">Take <span className="android-brand-word">SPARTAN-G</span><br /><em>Anywhere.</em></h2><p className="android-promo-subtitle">Your student journey, now in your pocket.</p><p className="android-promo-description">Keep your guidance space close. Return to your messages, make time for an appointment, and watch your Garden grow.</p><div className="android-download-actions"><AndroidDownloadButton /><Link className="android-guide-link" to="/download">Installation guide &amp; QR code <span aria-hidden="true">→</span></Link></div><p className="android-release-note">{ANDROID_RELEASE.minimumAndroid} · Version {ANDROID_RELEASE.version}<br />Presentation APK · Download opens Google Drive</p></div><AndroidCompanionArtwork /></section>;
}
