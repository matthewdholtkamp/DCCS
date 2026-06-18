// DCCS Operational Framework - Landing and framework overview renderers
(function () {
  window.App = window.App || {};
  Object.assign(window.App, {
  // ===== LANDING PAGE =====
  renderLanding(el) {
    const D = FRAMEWORK;
    const loeById = id => D.loes.find(loe => loe.id === id);
    const loeAccent = id => id === 3 ? '#1c4f78' : (loeById(id)?.color || '#FFB81C');
    const loeLabel = id => {
      const loe = loeById(id);
      return loe ? `LOE ${loe.id} · ${this.escapeHtml(loe.name)}` : `LOE ${id}`;
    };
    const renderGoals = goals => `
      <ol class="landing-goals">
        ${goals.map(goal => `<li>${this.escapeHtml(goal)}</li>`).join('')}
      </ol>`;
    const loeCards = D.loes.map(loe => `
      <article class="landing-loe-card" style="--loe-accent: ${loeAccent(loe.id)}">
        <span>LOE ${loe.id}</span>
        <h3>${this.escapeHtml(loe.name)}</h3>
        <p>${this.escapeHtml(loe.description)}</p>
      </article>
    `).join('');

    el.innerHTML = `
      <div class="landing-v2">
        <section class="landing-stage" id="landing-stage" aria-label="DCCS operational framework landing experience">
          <div class="landing-stage-inner">
          <div class="landing-bg-layer" aria-hidden="true">
            <div class="landing-bg active" data-bg="current" style="background-image: url('assets/Old_Hospital.jpg')"></div>
            <div class="landing-bg" data-bg="transition" style="background-image: url('assets/New_Hospital.webp')"></div>
            <div class="landing-bg" data-bg="phase2" style="background-image: url('assets/New_Hospital.webp')"></div>
            <div class="landing-bg" data-bg="command" style="background-image: url('assets/change_of_command.webp')"></div>
            <div class="landing-bg landing-bg--phase3" data-bg="phase3" style="background-image: url('assets/field_medicine.webp')"></div>
            <div class="landing-bg" data-bg="desired" style="background-image: url('assets/soldier_award.webp?v=20260613-v14')"></div>
            <div class="landing-scrim"></div>
          </div>

          <nav class="landing-progress-tracker" aria-label="Landing progress">
            <div class="landing-progress-track">
              <div class="landing-progress-line" aria-hidden="true"><span></span></div>
              <button class="landing-progress-step active" type="button" data-target="scene-current" aria-current="step">
                <span class="landing-progress-dot" aria-hidden="true"></span>
                <span class="landing-progress-label">Prior State</span>
                <span class="landing-progress-short">Prior</span>
              </button>
              <button class="landing-progress-step" type="button" data-target="scene-phase1">
                <span class="landing-progress-dot" aria-hidden="true"></span>
                <span class="landing-progress-label">Build</span>
                <span class="landing-progress-short">Bld</span>
              </button>
              <button class="landing-progress-step" type="button" data-target="scene-phase2">
                <span class="landing-progress-dot" aria-hidden="true"></span>
                <span class="landing-progress-label">Improve</span>
                <span class="landing-progress-short">Imp</span>
              </button>
              <button class="landing-progress-step" type="button" data-target="scene-phase3">
                <span class="landing-progress-dot" aria-hidden="true"></span>
                <span class="landing-progress-label">Refine</span>
                <span class="landing-progress-short">Ref</span>
              </button>
              <button class="landing-progress-step" type="button" data-target="scene-desired">
                <span class="landing-progress-dot" aria-hidden="true"></span>
                <span class="landing-progress-label">Desired State</span>
                <span class="landing-progress-short">Goal</span>
              </button>
            </div>
          </nav>

          <div class="landing-scenes">
            <section class="landing-scene in-view" id="scene-current" data-bg="current">
              <div class="landing-scene-card landing-scene-card--wide reveal">
                <div class="landing-kicker">PRIOR STATE</div>
                <h1 class="landing-title reveal-mask"><span class="reveal-mask-inner">We began as a reactive system.</span></h1>
                <p class="landing-copy">Underperforming on DHA scorecards — critical staffing shortages, unsustainable primary care access, an overloaded ER, and gaps in unit-level accountability straining the MSCoE partnership and the training mission.</p>
                <div class="landing-scroll-cue">Scroll to follow the framework ↓</div>
              </div>
            </section>

            <section class="landing-scene" id="scene-loes" data-bg="current">
              <div class="landing-scene-card landing-scene-card--wide reveal">
                <div class="landing-kicker">OPERATIONAL DESIGN</div>
                <h2 class="landing-title reveal-mask"><span class="reveal-mask-inner">Three lines of effort.</span></h2>
                <p class="landing-lead">${this.escapeHtml(D.mission)}</p>
                <div class="landing-loe-grid">
                  ${loeCards}
                </div>
                <p class="landing-footnote">Each phase elevates one line of effort as its main effort.</p>
              </div>
            </section>

            <section class="landing-scene" id="scene-phase1" data-bg="phase1">
              <div class="landing-scene-card reveal" style="--loe-accent: ${loeAccent(3)}">
                <div class="landing-kicker">PHASE 1 · BUILD · 1 AUG 2025 – 1 MAR 2026 · COMPLETE</div>
                <h2 class="landing-title reveal-mask"><span class="reveal-mask-inner">Build the system around MSCoE integration.</span></h2>
                <div class="landing-effort-tag">Main Effort — ${loeLabel(3)}</div>
                <p class="landing-copy">${this.escapeHtml(loeById(3).description)}</p>
                ${renderGoals([
                  'Implement Trainee Care Model — TOMS / CTMC / ER establishment',
                  'MSCoE Surgeon oversight — synchronize across BDEs',
                  'Executive Medicine — key-leader care; protect clinic access (SRP walk-ins, shaving/body-fat group encounters)',
                  'Establish MSCoE Surgeon as a true division-level staff function'
                ])}
                <a class="landing-action" href="#/framework">Open in framework →</a>
              </div>
            </section>

            <section class="landing-scene landing-scene--pivot" id="scene-transition" data-bg="transition">
              <div class="landing-scene-card landing-scene-card--compact reveal">
                <div class="landing-kicker">DECISIVE POINT</div>
                <h2 class="landing-title reveal-mask"><span class="reveal-mask-inner">Hospital Move</span></h2>
                <p class="landing-date">7 Apr 2026</p>
                <p class="landing-copy">The transition to the new facility — the pivot from building to improving.</p>
              </div>
            </section>

            <section class="landing-scene" id="scene-phase2" data-bg="phase2">
              <div class="landing-scene-card reveal" style="--loe-accent: ${loeAccent(1)}">
                <div class="landing-kicker">PHASE 2 · IMPROVE · 1 MAR – 10 AUG 2026 · ★ CURRENT</div>
                <h2 class="landing-title reveal-mask"><span class="reveal-mask-inner">Improve the medically ready force.</span></h2>
                <div class="landing-effort-tag">Main Effort — ${loeLabel(1)}</div>
                <p class="landing-copy">${this.escapeHtml(loeById(1).description)}</p>
                ${renderGoals([
                  'PCSL DHA care model — access to care / HEDIS plans developed and implemented',
                  'ER & Surgery throughput in the new facility — ER Fast Track (medic-led); surgery efficiency metrics developed and implemented',
                  'Behavioral Health — improve BH targeted care model and tracking'
                ])}
                <a class="landing-action" href="#/framework">Open in framework →</a>
              </div>
            </section>

            <section class="landing-scene landing-scene--pivot" id="scene-command" data-bg="command">
              <div class="landing-scene-card landing-scene-card--compact reveal">
                <div class="landing-kicker">DECISIVE POINT</div>
                <h2 class="landing-title reveal-mask"><span class="reveal-mask-inner">Change of Command</span></h2>
                <p class="landing-date">10 August 2026</p>
                <ul class="landing-bullets">
                  <li>Transfer of authority shifts the main effort from improving the system to refining it: lock in the gains, sharpen standards, and sustain disciplined execution.</li>
                </ul>
              </div>
            </section>

            <section class="landing-scene" id="scene-phase3" data-bg="phase3">
              <div class="landing-scene-card reveal" style="--loe-accent: ${loeAccent(2)}">
                <div class="landing-kicker">PHASE 3 · REFINE · 10 AUG 2026 – JUL 2027 · UPCOMING</div>
                <h2 class="landing-title reveal-mask"><span class="reveal-mask-inner">Refine the ready medical force.</span></h2>
                <div class="landing-effort-tag">Main Effort — ${loeLabel(2)}</div>
                <p class="landing-copy">${this.escapeHtml(loeById(2).description)}</p>
                ${renderGoals([
                  'Deliberate professional development — deliberate counseling at all levels',
                  'Prioritize military skills & education — schools and local training/education plans',
                  'Execute a deliberate leadership-transition plan'
                ])}
                <a class="landing-action" href="#/framework">Open in framework →</a>
              </div>
            </section>

            <section class="landing-scene landing-scene--desired" id="scene-desired" data-bg="desired">
              <div class="landing-scene-card landing-scene-card--wide reveal">
                <div class="landing-kicker">DESIRED STATE</div>
                <h1 class="landing-title reveal-mask"><span class="reveal-mask-inner">Right care. Right place. Right time.</span></h1>
                <p class="landing-copy">Consistently meeting DHA standards, with an integrated trainee care model and technologically empowered, accountable staff who protect the ER, drive efficiency, and forge a fully integrated MSCoE partnership that enables the training mission.</p>
                <div class="landing-motto-stamp">${this.escapeHtml(D.motto)}.</div>
                <a class="landing-action landing-action--primary" href="#/framework">Enter the framework →</a>
              </div>
            </section>
          </div>
          </div>
        </section>
      </div>`;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (window.LandingScroll) window.LandingScroll.init('#landing-stage');
      });
    });
  },

  renderLandingPhaseStrip() {
    const phases = FRAMEWORK.phases;
    return `
      <div class="landing-phase-strip" aria-label="Operational phase status">
        ${phases.map((phase, index) => `
          <div class="landing-phase-card ${phase.status}">
            <span class="landing-phase-label">${phase.status === 'active' ? '★ Current' : `Phase ${phase.id}`}</span>
            <strong>Phase ${phase.id}: ${phase.name}</strong>
          </div>
          ${index < phases.length - 1 ? `
            <div class="landing-transition-chip" aria-label="Transition from phase ${phase.id} to phase ${phases[index + 1].id}">
              <span>Transition</span>
              <strong>${phase.decisivePoint.name}</strong>
            </div>
          ` : ''}
        `).join('')}
      </div>`;
  },

  // ===== SHARED DISCLOSURE =====
  toggleDropdown(id) {
    const el = document.getElementById(id);
    const btn = el?.previousElementSibling;
    if (el) {
      el.classList.toggle('open');
      btn?.classList.toggle('open');
    }
  },

  // ===== FRAMEWORK OVERVIEW =====
  renderFramework(el) {
    const D = FRAMEWORK;
    const beatsData = D.beats || [];
    
    el.innerHTML = `
      <div class="framework-v2">
        <section class="framework-stage" id="framework-stage" aria-label="Detailed Operational Framework Presentation">
          <div class="framework-stage-inner">
            <div class="framework-cinema">
              <div class="framework-photo-layer" aria-hidden="true">
                <div class="framework-bg-photo active" data-bg="dark" style="background-image: radial-gradient(circle at 50% 42%, #172033 0%, #050810 58%, #020408 100%);"></div>
                <div class="framework-bg-photo" data-bg="old" style="background-image: url('assets/Old_Hospital.jpg');"></div>
                <div class="framework-bg-photo" data-bg="new" style="background-image: url('assets/New_Hospital.webp');"></div>
                <div class="framework-bg-photo" data-bg="change" style="background-image: url('assets/change_of_command.webp');"></div>
                <div class="framework-bg-photo" data-bg="field" style="background-image: url('assets/field_medicine.webp');"></div>
                <div class="framework-bg-photo" data-bg="award" style="background-image: url('assets/soldier_award.webp');"></div>
                <div class="framework-scrim"></div>
              </div>

              <div class="framework-viewport" aria-label="Operational design board viewport">
                <div class="framework-camera">
                  <article class="framework-board board-overview" aria-label="DCCS/MSCoE Operational Design Board">
                    
                    <div class="board-wrapper">
                      <header class="board-title-block">
                        <img class="board-logo board-logo-left" src="assets/framework-logo-left.jpg" alt="" aria-hidden="true">
                        <img class="board-logo board-logo-right" src="assets/framework-logo-right.jpg" alt="" aria-hidden="true">
                        <h1>DCCS/MSCoE Surgeon Operational Design - <span>2027</span></h1>
                        <p>Deliver reliable, high-quality healthcare that exceeds DHA standards for access and performance.</p>
                      </header>

                      <section class="board-mission board-region" id="b-mission" data-framework-region aria-label="Command mission">
                        <span class="board-label">COMMAND MISSION STATEMENT</span>
                        <p>Continuously synchronize medical efforts across the GLWCH and MSCoE footprint to deliver the right care, at the right place, at the right time—building a medically ready force, developing a ready medical force, and achieving seamless MSCoE Integration—in order to enable the MSCoE training mission.</p>
                      </section>

                      <div class="board-main-grid">

                        <section class="board-current board-region" id="b-current" data-framework-region aria-label="2025 Prior State">
                          <header>
                            2025 Prior State
                          </header>
                          <div class="state-content">
                            <p>GLWCH is a reactive system underperforming on DHA scorecards, where critical staffing shortages create mission-failure risk, unsustainable primary care access, and an overloaded ER. These systemic performance gaps, compounded by a lack of unit-level safety accountability, strain the MSCoE partnership and directly hinder the training mission.</p>
                          </div>
                        </section>

                        <div class="board-loe-col">
                          <div class="board-loe-label loe-1" data-framework-region>
                            <span>LOE 1</span>
                            <strong>Medically Ready<br>Force</strong>
                          </div>
                          <div class="board-loe-label loe-2" data-framework-region>
                            <span>LOE 2</span>
                            <strong>Ready Medical<br>Force</strong>
                          </div>
                          <div class="board-loe-label loe-3" data-framework-region>
                            <span>LOE 3</span>
                            <strong>MSCoE<br>Integration</strong>
                          </div>
                        </div>

                        <div class="board-phases-col">
                          <div class="board-phases-header">
                            <section class="board-phase board-region phase-1" id="b-p1" data-framework-region aria-label="Phase 1 Build">
                              <div class="phase-header-top">
                                <span class="board-phase-num">PHASE 1</span>
                                <h2>Build</h2>
                              </div>
                              <div class="phase-meta">Now - 1 Mar 26<br>HQ: TOMS, CTMC, ER, OB<br><strong class="me-text">ME: LOE 3</strong></div>
                            </section>

                            <div class="board-star board-region" id="b-dp1" data-framework-region tabindex="0" aria-label="Decisive Point 1 - Hospital Move">
                              <span class="star-glyph" aria-hidden="true">★</span><span class="star-label">DP1 · Hospital Move</span>
                              <div class="cell-full" hidden>
                                <ul>
                                  <li>Move into the new hospital cleanly.</li>
                                  <li>Time Build phase work to protect clinical continuity.</li>
                                </ul>
                              </div>
                            </div>

                            <section class="board-phase board-region phase-2" id="b-p2" data-framework-region aria-label="Phase 2 Improve">
                              <div class="phase-header-top">
                                <span class="board-phase-num">PHASE 2</span>
                                <h2>Improve</h2>
                              </div>
                              <div class="phase-meta">1 Mar - 1 Oct 26<br>HQ: PCSL, 3SL, BH, OS<br><strong class="me-text">ME: LOE 1</strong></div>
                            </section>

                            <div class="board-star board-region" id="b-dp2" data-framework-region tabindex="0" aria-label="Decisive Point 2 - Change of Command">
                              <span class="star-glyph" aria-hidden="true">★</span><span class="star-label">DP2 · Change of Cmd</span>
                              <div class="cell-full" hidden>
                                <ul>
                                  <li>Systems run without commander-dependent lift.</li>
                                  <li>Improve phase culminates at the change of command.</li>
                                </ul>
                              </div>
                            </div>

                            <section class="board-phase board-region phase-3" id="b-p3" data-framework-region aria-label="Phase 3 Refine">
                              <div class="phase-header-top">
                                <span class="board-phase-num">PHASE 3</span>
                                <h2>Refine</h2>
                              </div>
                              <div class="phase-meta">1 Oct 26 - Jul 27<br>HQ: DCCS, MSCoE<br><strong class="me-text">ME: LOE 2</strong></div>
                              <div class="phase-meta phase-dp">DP: PCS | Transition (July 27)</div>
                            </section>
                          </div>

                          <div class="loe-objectives" aria-hidden="true">
                            <div class="loe-objective loe-1">Deliver reliable, high-quality healthcare that exceeds DHA standards for access and performance.</div>
                            <div class="loe-objective loe-2">Develop and empower a professional, technologically proficient, and resilient medical team capable of executing the mission with initiative.</div>
                            <div class="loe-objective loe-3">Synchronize medical functions to support the MSCoE training mission by ensuring trainees receive the right care, right place, right time.</div>
                          </div>

                          <div class="board-cells-grid">
                            <!-- LOE 1 Row -->
                            <section class="board-cell board-region" id="b-p1-loe1" data-framework-region>
                              <ul class="cell-lines">
                                <li>Optimize Critical Services PC Access, ER flow, Surgical throughput</li>
                                <li>Care Ladder: Medic &rarr; CSSP &rarr; NP &rarr; MD</li>
                                <li>Designate no-fail: OB &amp; BH</li>
                              </ul>
                              <div class="cell-full" hidden>
                                <ul>
                                  <li>Optimize PC Access & ER flow</li>
                                  <li>Care Ladder: Medic ➔ CSSP ➔ NP ➔ MD</li>
                                  <li>Designate no-fail: OB & BH</li>
                                </ul>
                              </div>
                            </section>
                            <section class="board-cell board-region main-effort" id="b-p2-loe1" data-framework-region>
                              <ul class="cell-lines">
                                <li>PCSL DHA Access acute &lt;24 hrs; routine &lt;7 days</li>
                                <li>New facility throughput and surgery flow</li>
                                <li>Medic-led ER fast track</li>
                              </ul>
                              <div class="cell-full" hidden>
                                <ul>
                                  <li>PCSL DHA Care Model</li>
                                  <li>Throughput in New Facility</li>
                                  <li>Fast Track ER (Medic-led)</li>
                                </ul>
                              </div>
                            </section>
                            <section class="board-cell board-region" id="b-p3-loe1" data-framework-region>
                              <ul class="cell-lines">
                                <li>PCSL Flow RCA primary care access PI</li>
                                <li>Optimize 3SL SOTs and OR flow</li>
                                <li>Integrate Tech/AI at point of care</li>
                              </ul>
                              <div class="cell-full" hidden>
                                <ul>
                                  <li>Refine PCSL Flow & RCA PI</li>
                                  <li>Optimize 3SL SOTs</li>
                                  <li>Tech/AI daily integration</li>
                                </ul>
                              </div>
                            </section>

                            <!-- LOE 2 Row -->
                            <section class="board-cell board-region" id="b-p1-loe2" data-framework-region>
                              <ul class="cell-lines">
                                <li>Tech Enablement AI, PowerBI, OpenEvidence, Ask Sage</li>
                                <li>Role clarity, counseling, credentials</li>
                                <li>Functional needs analysis</li>
                              </ul>
                              <div class="cell-full" hidden>
                                <ul>
                                  <li>Introduce AI & PowerBI tools</li>
                                  <li>Role clarity & Counseling</li>
                                  <li>Safety/Credentials compliance</li>
                                  <li>Conduct Functional Needs Analysis</li>
                                </ul>
                              </div>
                            </section>
                            <section class="board-cell board-region" id="b-p2-loe2" data-framework-region>
                              <ul class="cell-lines">
                                <li>Clinical Efficiency reorganize clinic work</li>
                                <li>Man toward RN/SW &amp; APPs</li>
                                <li>Telehealth and asynchronous care</li>
                              </ul>
                              <div class="cell-full" hidden>
                                <ul>
                                  <li>Reorganize for Clinical Efficiency</li>
                                  <li>Manning Need: RN/SW & APPs</li>
                                  <li>Integrate Telehealth & Async</li>
                                </ul>
                              </div>
                            </section>
                            <section class="board-cell board-region main-effort" id="b-p3-loe2" data-framework-region>
                              <ul class="cell-lines">
                                <li>Leadership Development six-month LPD calendar</li>
                                <li>Quarterly counseling and PME timelines</li>
                                <li>Mentorship and leader transition</li>
                              </ul>
                              <div class="cell-full" hidden>
                                <ul>
                                  <li>Deliberate LPD Calendar</li>
                                  <li>Enforce military PME timelines</li>
                                  <li>Mentorship & Leadership Transition</li>
                                </ul>
                              </div>
                            </section>

                            <!-- LOE 3 Row -->
                            <section class="board-cell board-region main-effort" id="b-p1-loe3" data-framework-region>
                              <ul class="cell-lines">
                                <li>Trainee Care Model TOMS / CTMC / ER</li>
                                <li>Establish Surgeon oversight</li>
                                <li>Executive Medicine and SRP access</li>
                              </ul>
                              <div class="cell-full" hidden>
                                <ul>
                                  <li>Trainee Care: TOMS/CTMC/ER</li>
                                  <li>Establish Surgeon Oversight</li>
                                  <li>Executive Med program</li>
                                  <li>Protect Clinic Access & SRP</li>
                                </ul>
                              </div>
                            </section>
                            <section class="board-cell board-region" id="b-p2-loe3" data-framework-region>
                              <ul class="cell-lines">
                                <li>Standardize Med Ops OPORDs and BAS SOPs</li>
                                <li>Predictive supply ASL</li>
                                <li>Automated readiness tracker</li>
                              </ul>
                              <div class="cell-full" hidden>
                                <ul>
                                  <li>Standardize Med Ops (OPORDs)</li>
                                  <li>Predictive supply ASL</li>
                                  <li>Automated Readiness Tracker</li>
                                </ul>
                              </div>
                            </section>
                            <section class="board-cell board-region" id="b-p3-loe3" data-framework-region>
                              <ul class="cell-lines">
                                <li>Institutionalize AAR Loop exercises to SOP updates</li>
                                <li>Readiness in MSCoE battle rhythm</li>
                                <li>Achieve predictive logistics</li>
                              </ul>
                              <div class="cell-full" hidden>
                                <ul>
                                  <li>AAR loop on training exercises</li>
                                  <li>Med council readiness integration</li>
                                  <li>Achieve Predictive Logistics</li>
                                </ul>
                              </div>
                            </section>
                          </div>
                        </div>

                        <section class="board-desired board-region" id="b-desired" data-framework-region aria-label="2027 Desired State">
                          <header>
                            2027 Desired State
                          </header>
                          <div class="state-content">
                            <p>Be a High Reliability Organization consistently meeting DHA standards, where an integrated trainee care model and technologically empowered staff deliver the right care, right place, right time, protect the ER, and drive clinical efficiency. This foundation reinforced by accountable unit leaders, will forge a fully integrated partnership with MSCoE that directly enables the training mission.</p>
                          </div>
                        </section>

                      </div>
                    </div>
                  </article>
                </div>
              </div>

              <div class="framework-scroll-cue" aria-hidden="true">
                <span class="cue-text">Scroll to walk the plan</span>
                <span class="cue-chevron">⌄</span>
              </div>

              <aside class="framework-detail" aria-live="polite" aria-label="Section detail">
                <div class="detail-eyebrow"></div>
                <div class="detail-body"></div>
              </aside>

              <nav class="framework-progress-tracker" aria-label="Framework progression tracker">
                <div class="framework-progress-track">
                  <div class="framework-progress-line" aria-hidden="true"><span></span></div>
                  <button class="framework-progress-step active" type="button" data-rail="overview" aria-current="step">
                    <span class="framework-progress-dot" aria-hidden="true"></span>
                    <span class="framework-progress-label">Overview</span>
                  </button>
                  <button class="framework-progress-step" type="button" data-rail="mission">
                    <span class="framework-progress-dot" aria-hidden="true"></span>
                    <span class="framework-progress-label">Mission</span>
                  </button>
                  <button class="framework-progress-step" type="button" data-rail="prior">
                    <span class="framework-progress-dot" aria-hidden="true"></span>
                    <span class="framework-progress-label">Prior State</span>
                  </button>
                  <button class="framework-progress-step" type="button" data-rail="p1">
                    <span class="framework-progress-dot" aria-hidden="true"></span>
                    <span class="framework-progress-label">Phase 1</span>
                  </button>
                  <button class="framework-progress-step" type="button" data-rail="p2">
                    <span class="framework-progress-dot" aria-hidden="true"></span>
                    <span class="framework-progress-label">Phase 2</span>
                  </button>
                  <button class="framework-progress-step" type="button" data-rail="p3">
                    <span class="framework-progress-dot" aria-hidden="true"></span>
                    <span class="framework-progress-label">Phase 3</span>
                  </button>
                  <button class="framework-progress-step" type="button" data-rail="desired">
                    <span class="framework-progress-dot" aria-hidden="true"></span>
                    <span class="framework-progress-label">Desired State</span>
                  </button>
                </div>
              </nav>
            </div>

            <div class="framework-beats" aria-hidden="true"></div>
            <div class="framework-static-script">
              ${beatsData.map(beat => `
                <section class="framework-static-beat">
                  <h2>${this.escapeHtml(beat.eyebrow || beat.id)}</h2>
                  <p>${this.escapeHtml(beat.text)}</p>
                </section>
              `).join('')}
            </div>
          </div>
        </section>
      </div>`;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (window.FrameworkScroll) window.FrameworkScroll.init('#framework-stage');
      });
    });
  },

  });
}());
