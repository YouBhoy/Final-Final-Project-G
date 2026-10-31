import { useEffect, type ReactNode } from "react";
import { Link } from "react-router-dom";
import "../../styles/public-pages.css";

export function PublicAuthLayout({ title, subtitle, children, registration = false }: { title: string; subtitle?: string; children: ReactNode; registration?: boolean }) {
 useEffect(()=>{document.title=title+' | SPARTAN-G';},[title]);
 return <div className="sg-public sign-in-warm"><a className="skip" href="#auth-main">Skip to form</a><main className="auth" id="auth-main">
 <section className="auth-story" aria-label="Welcome to SPARTAN-G"><Link className="brand" to="/"><img src="/spartan-g-logo.png" alt="" width="42" height="42" /><div><strong>SPARTAN-G</strong><small>GUIDANCE &amp; COUNSELING</small></div></Link>
 <div><p className="eyebrow">For the student behind the Spartan</p><h2>A place to pause.<br />{' '}A way forward.</h2><p className="story-copy">Connect with guidance facilitators, book appointments, and access your wellbeing assessments in one place.</p><img className="campus-img" src="/campus-background.jpg" alt="Batangas State University campus" width="500" height="230" /></div>
 <div className="campus-strip"><img src="/batstateu-logo.png" alt="Batangas State University seal" /><p className="small">Batangas State University<br />The National Engineering University</p></div></section>
 <section className="auth-form" aria-labelledby="auth-title"><Link className="back-home" to="/">← Back to SPARTAN-G</Link><p className="eyebrow">{registration?'Student registration':'Student & staff access'}</p><h1 id="auth-title">{title}</h1>{subtitle&&<p>{subtitle}</p>}
 {registration&&<p className="signup-note" style={{marginTop:14}}>Create a student account to access your campus guidance services.</p>}{children}
 <details className="policy-overview"><summary>How your information is used</summary><p>Your account and guidance information support assessments, appointments, and conversations. Authorized facilitators and administrators have access according to their roles and permissions.</p><p>You will review the current platform privacy policy before entering the portal. Assessments support guidance and are not diagnoses.</p></details>
 </section></main></div>;
}
