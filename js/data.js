// DCCS/MSCoE Surgeon Operational Framework - Data Model
const FRAMEWORK = {
  title: "DCCS/MSCoE Surgeon Operational Design — 2027",
  hospital: "General Leonard Wood Community Hospital",
  hospitalAbbr: "GLWCH",
  installation: "Fort Leonard Wood",
  installationMission: "Force Generation — Basic Training, AIT, and NCOES for Engineers, Chemical, and Military Police",
  leader: { name: "LTC Matthew D. Holtkamp", title: "Deputy Commander for Clinical Services (DCCS) & MSCoE Command Surgeon", phone: "515-371-3630", email: "matthew.d.holtkamp.mil@health.mil" },
  assistant: { name: "SSG Flor Holloway", title: "NCOIC / Executive Assistant" },
  motto: "Work Smart, Move Fast, Be Nice",
  mission: "Continuously synchronize medical efforts across the GLWCH and MSCoE footprint to deliver the right care, at the right place, at the right time—building a medically ready force, developing a ready medical force, and achieving seamless MSCoE integration—in order to enable the MSCoE training mission.",
  vision: "Deliver reliable, high-quality healthcare that exceeds DHA standards for access and performance.",
  currentPhase: 2,
  priorityPopulations: ["Trainees (Primary Mission)", "Active Duty Permanent Party", "Spouses & Dependents", "All Others"],
  currentState: "GLWCH is a reactive system underperforming on DHA scorecards, where critical staffing shortages create mission-failure risk, unsustainable primary care access, and an overloaded ER. These systemic performance gaps, compounded by a lack of unit-level safety accountability, strain the MSCoE partnership and directly hinder the training mission.",
  desiredState: "Be a High Reliability Organization consistently meeting DHA standards, where an integrated trainee care model and technologically empowered staff deliver the right care, right place, right time, protect the ER, and drive clinical efficiency. This foundation reinforced by accountable unit leaders, will forge a fully integrated partnership with MSCoE that directly enables the training mission.",

  phases: [
    { id: 1, name: "Build", dateRange: "1 Aug 2025 – 1 Mar 2026", mainEffort: "MSCoE Integration", hq: "TOMS, CTMC, BH, ER", status: "complete",
      decisivePoint: { name: "Hospital Move", date: "7 Apr 2026", status: "complete" },
      description: "Stabilize critical systems, implement the trainee care model, and prepare for hospital transition." },
    { id: 2, name: "Improve", dateRange: "1 Mar – 10 Aug 2026", mainEffort: "Medically Ready Force", hq: "PCSL, ER, 3SL, BH, Credentials", status: "active",
      decisivePoint: { name: "Change of Command", date: "10 Aug 2026", status: "upcoming" },
      description: "Leverage the new facility and stabilized processes to drive performance and achieve all DHA metrics." },
    { id: 3, name: "Refine", dateRange: "10 Aug 2026 – Jul 2027", mainEffort: "Ready Medical Force", hq: "DCCS Leaders", status: "upcoming",
      decisivePoint: { name: "PCS / Transition", date: "Jul 2027", status: "upcoming" },
      description: "Embed a culture of continuous improvement, ensuring systems are refined and the team is empowered for leadership transition." }
  ],

  loes: [
    { id: 1, name: "Medically Ready Force", description: "Deliver reliable, high-quality healthcare that exceeds DHA standards for access and performance.", icon: "MRF", color: "#FFB81C" },
    { id: 2, name: "Ready Medical Force", description: "Develop and empower a professional, technologically proficient, and resilient medical team capable of executing the mission with initiative.", icon: "RMF", color: "#46523f" },
    { id: 3, name: "MSCoE Integration", description: "Synchronize medical functions to support the MSCoE training mission by ensuring trainees receive the right care, right place, right time.", icon: "MS", color: "#cccccc" }
  ],

  serviceLines: [
    {
      id: "pcsl", name: "Primary Care Service Line", abbr: "PCSL", leader: "MAJ Tobin",
      icon: "stethoscope",
      clinics: ["Internal Medicine Clinic", "Family Medicine Clinic", "Soldier Clinic", "Medic Clinic", "Optometry", "Respiratory", "Pediatrics"],
      trackedMetrics: [
        { id: "pcsl-acute", name: "Acute Appointments (Goal: <24hr)", unit: "hours", goal: 24, direction: "lower" },
        { id: "pcsl-followup", name: "Follow-up Appointments (Goal: <7 days)", unit: "days", goal: 7, direction: "lower" },
        { id: "pcsl-medic", name: "Medic Clinic Encounters", unit: "per week", goal: null, direction: "higher" },
        { id: "pcsl-nursing", name: "Nursing-Led Encounters", unit: "per week", goal: null, direction: "higher" },
        { id: "pcsl-virtual", name: "Number of Virtual Appointments by Week", unit: "per week", goal: null, direction: "higher" }
      ],
      hedisMetrics: [
        { name: "Breast Cancer Screening (BCS)", ages: "40–74", goal: "≥90%", description: "Mammogram screening for eligible members" },
        { name: "Cervical Cancer Screening (CCS)", ages: "21–64", goal: "≥90%", description: "Pap test and/or hrHPV testing" },
        { name: "Colorectal Cancer Screening (COL)", ages: "45–75", goal: "≥90%", description: "Colonoscopy, FIT-DNA, or FOBT" },
        { name: "Diabetes HbA1c Assessment (GSD)", ages: "18–75", goal: "≥90%", description: "Glycemic status assessment for diabetics" },
        { name: "Blood Pressure Control — Diabetes (BPD)", ages: "18–75", goal: "≥90%", description: "BP <140/90 for diabetic patients" },
        { name: "Blood Pressure Control — Hypertension (BPC)", ages: "18–85", goal: "≥90%", description: "BP <140/90 for hypertensive patients" },
        { name: "Diabetic Eye Exam (EED)", ages: "18–75", goal: "≥90%", description: "Retinal exam by eye care professional" },
        { name: "Kidney Health — Diabetes (KED)", ages: "18–75", goal: "≥90%", description: "eGFR and uACR evaluation" },
        { name: "Statin Therapy — Cardiovascular (SPC)", ages: "21–75", goal: "≥90%", description: "Statin adherence for ASCVD patients" },
        { name: "Statin Therapy — Diabetes (SPD)", ages: "40–75", goal: "≥90%", description: "Statin adherence for diabetic patients" }
      ],
      tasks: [
        { id: "pcsl-p1-1", title: "Optimize Critical Services — Primary Care Access", description: "Establish baseline access metrics and address primary care appointment availability.", loe: 1, phase: 1, status: "complete", kpis: ["Routine wait times baseline established", "Nursing encounter volume tracked"], majorKpiIndices: [0] },
        { id: "pcsl-p1-2", title: "Implement Care Ladder Model", description: "Implement care ladder: Medic → CSSP → NP → Doc to optimize provider utilization. Nursing-led protocols now in place, medic walk-in clinic extended to all-day hours.", loe: 1, phase: 1, status: "in-progress", kpis: ["Roles defined", "Nursing-led protocols increasing by %", "Increase number of nursing encounters", "Medic walk-in clinic extended hours to all day", "ADTMC implemented in Medic Clinic"], majorKpiIndices: [0] },
        { id: "pcsl-p1-3", title: "Conduct Functional Needs Analysis", description: "Analyze manning requirements to support care ladder — increase RN/SW & APP (PA/NP) over Physicians/PhDs.", loe: 2, phase: 1, status: "complete", kpis: ["Conduct needs analysis (completed)", "Manning gaps continually identified"] },
        { id: "pcsl-p1-4", title: "Protect Clinic Access — SRP Walk-ins", description: "Enforce SRP as single walk-in point for all readiness tasks (PHAs/physicals). Group shaving and body fat encounters.", loe: 3, phase: 1, status: "in-progress", kpis: ["SRP walk-ins are happening", "Group encounters implemented"] },
        { id: "pcsl-p2-1", title: "PCSL DHA Care Model (Access / HEDIS)", description: "Drive performance to meet DHA targets for appointments (<24hr acutes / <7d follow-up) and 90% HEDIS completion. HEDIS nurse must be monitored monthly with throughput numbers.", loe: 1, phase: 2, status: "in-progress", kpis: ["Acute care appointments <24hr", "Follow-up appointments <7 days", "HEDIS completion goal is 90% (not 100%)", "HEDIS nurse throughput monitored monthly"], majorKpiIndices: [2] },
        { id: "pcsl-p2-2", title: "Reorganize Clinic for Efficiency", description: "Restructure clinic operations, provider templates, and empanelment to maximize efficiency in new facility (moved 7 Apr 2026). Continue optimizing provider templates with clinical ops. Increase virtual appointments.", loe: 2, phase: 2, status: "in-progress", kpis: ["Provider templates optimized with clinical operations", "Increase virtual appointments to standard 15% across PCSL"] },
        { id: "pcsl-p2-3", title: "Integrate Telehealth & Asynchronous Encounters", description: "All providers now credentialed for telehealth. Need to operationalize virtual health platform and develop specialty care telehealth consult plan.", loe: 2, phase: 2, status: "in-progress", kpis: ["20% of follow-ups virtual", "15% total appointments virtual", "Telehealth providers credentialed", "Specialty care telehealth consult plan operationalized"] },
        { id: "pcsl-p2-4", title: "Track Metrics via Technology", description: "Use tracked metrics section at top of page (acute, follow-ups, medic numbers, nursing numbers, and virtual appointment numbers) over time instead of full PowerBI panel balancing.", loe: 2, phase: 2, status: "in-progress", kpis: ["Access to care (24h/7d) tracked via line graph", "Medic clinic numbers tracked by week", "Nursing encounter numbers tracked by week", "Virtual appointment numbers tracked by week"] },
        { id: "pcsl-p3-1", title: "Refine PCSL Flow — PI Projects / RCA", description: "Charter formal performance improvement projects to address PCSL inefficiencies impacting patient flow, healthcare burnout, quality, and capacity.", loe: 1, phase: 3, status: "not-started", kpis: ["Start 3 PI projects", "Track 3 PI projects", "Complete 3 PI projects (improve patient care flow, burnout, capacity)"] },
        { id: "pcsl-p3-2", title: "AI/CDS Integration into Clinic Workflows", description: "Deploy ambient listening/speaking AI tools. Monthly AI/technology working groups to improve chronic disease guideline adherence using OpenEvidence, Ask Sage, and best practice tools.", loe: 1, phase: 3, status: "not-started", kpis: ["80% adoption of ambient speak", "Monthly AI working groups conducted", "Chronic disease guideline adherence is 90%", "Use of OpenEvidence / Ask Sage integrated"] },
        { id: "pcsl-p3-3", title: "Monthly/Quarterly Metric Reviews", description: "Monthly chief meetings: deep dive on access to care numbers. Quarterly: review HEDIS targets, medical clinic volumes, nursing protocols, care ladder implementation, and patient population focus.", loe: 1, phase: 3, status: "not-started", kpis: ["Monthly chief meeting access to care deep dive", "Quarterly HEDIS target review", "Quarterly care ladder review", "Patient population focus checked quarterly"] }
      ]
    },
    {
      id: "surgery", name: "Surgical Services Service Line", abbr: "3SL", leader: "LTC Weir",
      icon: "scalpel",
      clinics: ["General Surgery", "Orthopedic Surgery", "Dermatology", "Women's Health / OB-GYN", "PACU", "Operating Room", "Anesthesia"],
      metricGroups: [
        {
          id: "surgery-specialty",
          name: "Surgery Specialty Breakdown",
          description: "Weekly surgical volume by total and specialty.",
          period: "week",
          unit: "surgeries",
          series: [
            { id: "surgery-total", name: "Total Surgeries", unit: "surgeries", direction: "neutral", color: "#ffffff" },
            { id: "surgery-obgyn", name: "OB/GYN", unit: "surgeries", direction: "neutral", color: "#ffb81c" },
            { id: "surgery-general", name: "General Surgery", unit: "surgeries", direction: "neutral", color: "#7aac6a" },
            { id: "surgery-ortho", name: "Orthopedics", unit: "surgeries", direction: "neutral", color: "#5aa9e6" }
          ]
        }
      ],
      tasks: [
        { id: "surg-p1-1", title: "Designate No-Fail Mission: Hospital Services / OB-GYN", description: "Establish OB/GYN and hospital inpatient services as no-fail critical missions.", loe: 1, phase: 1, status: "not-reviewed", kpis: ["No-fail designation established", "Coverage MOA signed"], majorKpiIndices: [0] },
        { id: "surg-p2-1", title: "Improve Throughput in New Facility", description: "Leverage new hospital to optimize OR scheduling, target 176 cases/month.", loe: 1, phase: 2, status: "not-reviewed", kpis: ["≥176 cases monthly", "First-case on-time starts improving"], majorKpiIndices: [0] },
        { id: "surg-p2-2", title: "Block Utilization Review & Reallocation", description: "Weekly block reviews with reallocation to ensure each service line uses time efficiently.", loe: 1, phase: 2, status: "not-reviewed", kpis: ["Block utilization >80%"] },
        { id: "surg-p2-3", title: "Real-time Case Delay Coding with Heat Maps", description: "Code every delayed case (late surgeon, equipment, anesthesia) and aggregate into heat maps.", loe: 1, phase: 2, status: "not-reviewed", kpis: ["≥90% delay codes entered"] },
        { id: "surg-p3-1", title: "Optimize 3SL Throughput — RCA on Bottlenecks", description: "Root cause analysis from consult to recovery: anesthesia constraints, first-case starts, OR turnover.", loe: 1, phase: 3, status: "not-reviewed", kpis: ["Top 3 corrective actions closed each quarter"] },
        { id: "surg-p3-2", title: "Quarterly OB Drills", description: "High-reliability OB simulation drills for hemorrhage, stat C-section, etc.", loe: 1, phase: 3, status: "not-reviewed", kpis: ["100% team participation", "Corrective changes within 30 days"] },
        { id: "surg-p3-3", title: "Monthly Periop Scorecard Publication", description: "Transparent monthly reporting of surgical KPIs.", loe: 1, phase: 3, status: "not-reviewed", kpis: ["FCOTS >90%", "Turnover <20 min", "Block utilization >80%"] }
      ]
    },
    {
      id: "mental-health", name: "Mental Health Service Line", abbr: "MH", leader: "Dr. Fellwock",
      icon: "brain",
      clinics: ["Outpatient Mental Health", "Building 822 — Trainee Walk-in BH", "SUDCC", "Child & Family BHS", "Family Advocacy Program"],
      trackedMetrics: [
        { id: "mh-active-duty-off-post", name: "Active Duty Referred Off Post This Week", unit: "referrals", goal: null, direction: "neutral", period: "week", featured: true },
        { id: "mh-4707-epts", name: "Trainees Sent for 4707 / EPTS", unit: "trainees", goal: null, direction: "neutral", period: "week", featured: true }
      ],
      tasks: [
        { id: "mh-p1-1", title: "Implement Care Ladder — BH Vector", description: "Establish BH technician-led and group therapy vectors to expand access.", loe: 1, phase: 1, status: "not-reviewed", kpis: ["Group therapy sessions established", "BH tech protocols active"] },
        { id: "mh-p1-2", title: "BH Providers at Brigade Level (TOMS)", description: "Ensure each of the three training brigades has an embedded BH officer.", loe: 3, phase: 1, status: "not-reviewed", kpis: ["3/3 BDE BHOs assigned"], majorKpiIndices: [0] },
        { id: "mh-p2-1", title: "Improve BH Targeted Care Model", description: "Scale group therapy and technician-led vectors to expand access and meet readiness obligations.", loe: 1, phase: 2, status: "not-reviewed", kpis: ["25% of BH encounters delivered in groups"] },
        { id: "mh-p2-2", title: "Asynchronous Screening Embedded in Intake", description: "PHQ-9 and PCL-5 completed before appointment and routed by nursing staff.", loe: 2, phase: 2, status: "not-reviewed", kpis: ["≥80% screening completion pre-visit"], majorKpiIndices: [0] },
        { id: "mh-p2-3", title: "BH Service Dashboard", description: "Dashboard tracking time-to-intake, no-show rates, and crisis follow-up compliance.", loe: 2, phase: 2, status: "not-reviewed", kpis: ["No-show rate <10%"] },
        { id: "mh-p3-1", title: "RCA for Any Access Breach >7 Days", description: "Review every breach to eliminate structural causes of delay.", loe: 1, phase: 3, status: "not-reviewed", kpis: ["100% corrective actions within 30 days"] },
        { id: "mh-p3-2", title: "AI-Assisted Triage Prompts in EHR", description: "AI tools auto risk-stratify incoming referrals and screeners.", loe: 1, phase: 3, status: "not-reviewed", kpis: ["≥75% provider adoption"] },
        { id: "mh-p3-3", title: "Quarterly Group Curriculum Review", description: "Compare group content against outcomes to ensure interventions meet needs.", loe: 1, phase: 3, status: "not-reviewed", kpis: ["≥90% patient satisfaction", "Stable or improved outcome scores"] }
      ]
    },
    {
      id: "emergency", name: "Emergency Department", abbr: "ED", leader: "MAJ Henderson",
      icon: "emergency",
      clinics: ["Emergency Room", "Ambulance Section"],
      trackedMetrics: [
        { id: "er-total-census", name: "Total Census That Day", unit: "patients", goal: null, direction: "neutral", period: "day", featured: true }
      ],
      metricGroups: [
        {
          id: "er-trainee-acuity",
          name: "Trainee Acuity & LWOBS",
          description: "Daily trainee volume, ESI acuity, and LWOBS.",
          period: "day",
          unit: "patients",
          series: [
            { id: "er-total-trainees", name: "Total Trainees", unit: "patients", direction: "neutral", color: "#ffb81c" },
            { id: "er-esi-1-2", name: "ESI 1/2", unit: "patients", direction: "neutral", color: "#ff6b6b" },
            { id: "er-esi-3", name: "ESI 3", unit: "patients", direction: "neutral", color: "#5aa9e6" },
            { id: "er-esi-4-5", name: "ESI 4/5", unit: "patients", direction: "neutral", color: "#7aac6a" },
            { id: "er-lwobs", name: "LWOBS", unit: "patients", direction: "neutral", color: "#c084fc" }
          ]
        }
      ],
      tasks: [
        { id: "ed-p1-1", title: "Optimize ER Flow — Screening & Redirection", description: "Screen and redirect non-emergent SITs. Expanded base-wide with Brigade Surgeon support.", loe: 1, phase: 1, status: "not-reviewed", kpis: ["16.8% decrease in trainees in ED", "24.1% redirection success", "Low acuity cases dropped from 45% to 34%"], majorKpiIndices: [0] },
        { id: "ed-p1-2", title: "Institutionalize Training in DI Orientation", description: "Embed ER redirection protocols into Drill Instructor orientation for sustainment.", loe: 1, phase: 1, status: "not-reviewed", kpis: ["Protocol embedded in DI orientation"] },
        { id: "ed-p2-1", title: "ER Fast Track — Medic Led", description: "Implement medic-led fast track in new facility to handle low-acuity patients.", loe: 1, phase: 2, status: "not-reviewed", kpis: ["Fast track operational", "LOS reduced for low-acuity patients"], majorKpiIndices: [0] },
        { id: "ed-p3-1", title: "Quarterly RCA on LOS Outliers", description: "Systematically review patients with exceptionally long stays to identify recurring system failures.", loe: 1, phase: 3, status: "not-reviewed", kpis: ["≥90% corrective actions closed within 30 days"] },
        { id: "ed-p3-2", title: "AI/CDS Integration at Triage & Provider Points", description: "Clinical decision support tools (OpenEvidence, Ask Sage) at triage reduce diagnostic error.", loe: 1, phase: 3, status: "not-reviewed", kpis: ["≥75% provider adoption", "Measurable reduction in diagnostic variance"] },
        { id: "ed-p3-3", title: "72-Hour Revisit Reviews", description: "Structured review of every unscheduled ED revisit within 72 hours.", loe: 1, phase: 3, status: "not-reviewed", kpis: ["Revisit rate <2%"] }
      ]
    },
    {
      id: "mscoe", name: "MSCoE Surgeon / Trainee Care Model", abbr: "MSCoE", leader: "LTC Holtkamp",
      icon: "shield",
      clinics: ["TOMS (3 Brigades, 12 Providers)", "CTMC", "Brigade Surgeon Cells (x3)", "H2F (Holistic Health & Fitness)", "Executive Medicine"],
      trackedMetrics: [
        { id: "mscoe-total-trainees", name: "Total Trainees This Week", unit: "trainees", goal: null, direction: "neutral", period: "week", featured: true },
        { id: "mscoe-self-care", name: "Self Care Trainees This Week", unit: "trainees", goal: null, direction: "neutral", period: "week", featured: true },
        { id: "mscoe-adtmc-medic-care", name: "ADTMC (Medic Care) This Week", unit: "trainees", goal: null, direction: "neutral", period: "week", featured: true }
      ],
      traineeCareFlow: [
        { step: 1, name: "BAS / TOMS", description: "Basic meds, medic + ADTMC algorithms, minimal ancillary. Trainee PCM.", capacity: "Avg 22 pts/day/provider" },
        { step: 2, name: "CTMC", description: "Labs, radiology, PT, pharmacy, school physicals (Airborne, etc). Next level up from BAS.", capacity: "Max 150 pts/day (200 w/ ADTMC)" },
        { step: 3, name: "Hospital — IM Clinic", description: "Gatekeeper for specialty consults off-post. Sees complex cases requiring sub-specialist referral.", capacity: "Max 4 pts/day" },
        { step: 4, name: "Off-Post Specialist", description: "Neurology, Rheumatology, Cardiology, etc. Requires IM Clinic referral.", capacity: "Network dependent" }
      ],
      tasks: [
        { id: "msc-p1-1", title: "Implement Trainee Care Model (TOMS/CTMC/ER)", description: "Execute three-pronged approach: right care, right place, right time for trainees.", loe: 3, phase: 1, status: "not-reviewed", kpis: ["Trainee care model operational", "BAS→CTMC→Hospital flow established"], majorKpiIndices: [0] },
        { id: "msc-p1-2", title: "Establish MSCoE Surgeon Oversight", description: "Restructure MSCoE medical LOE — Surgeon leads synchronizing manning, training, equipping across brigades.", loe: 3, phase: 1, status: "not-reviewed", kpis: ["Surgeon oversight structure formalized", "Rating chain established for BDE surgeons"] },
        { id: "msc-p1-3", title: "Institute Executive Medicine", description: "Dedicated healthcare access and readiness oversight for MSCoE key leaders.", loe: 3, phase: 1, status: "not-reviewed", kpis: ["Executive Med program established"] },
        { id: "msc-p2-1", title: "Standardize Medical Operations", description: "Standardize OPORD Annex Q, BAS SOPs, and organize CTC medics under central authority.", loe: 3, phase: 2, status: "not-reviewed", kpis: ["100% brigades using approved formats"] },
        { id: "msc-p2-2", title: "Establish Predictive Medical Logistics", description: "Brigade ASLs, DCAM-trained medics, track usage rates, refine TDA to match FORSCOM.", loe: 3, phase: 2, status: "not-reviewed", kpis: ["≥75% supply forecast accuracy"] },
        { id: "msc-p2-3", title: "Develop Automated Readiness Tracker", description: "Data pipeline from Army Vantage to Power BI dashboard for real-time readiness metrics.", loe: 3, phase: 2, status: "not-reviewed", kpis: ["≥90% units reporting in dashboard"], majorKpiIndices: [0] },
        { id: "msc-p3-1", title: "Institutionalize Continuous Improvement Loop", description: "Mandated AARs post-exercises, corrective changes within 30 days.", loe: 3, phase: 3, status: "not-reviewed", kpis: ["100% AAR corrective updates within 30 days"] },
        { id: "msc-p3-2", title: "Integrate Medical Readiness into MSCoE Battle Rhythm", description: "Predictive readiness projections briefed at quarterly MSCoE medical readiness council.", loe: 3, phase: 3, status: "not-reviewed", kpis: ["Forecasts briefed quarterly", "≥90% forecast accuracy"] },
        { id: "msc-p3-3", title: "Achieve Predictive Medical Logistics", description: "Annual MEDLOG spend plans from 12-month trend data. Zero critical stockouts.", loe: 3, phase: 3, status: "not-reviewed", kpis: ["≥90% accuracy on annual Class VIII budget", "Zero critical stockouts"] }
      ]
    }
  ],

  // Cross-cutting Phase tasks (LOE 2 items that apply to all service lines)
  crossCuttingTasks: [
    { id: "cc-p1-1", title: "Introduce Efficiency Tools (AI & Automation)", phase: 1, loe: 2, status: "in-progress", description: "Conduct LPD sessions on AI tools (OpenEvidence, Ask Sage, ambient listening). Automate workflows. Deploy ADTMC in appropriate clinics.", kpis: ["Ongoing LPD sessions on efficiency tools", "Ambient listening used", "Get OpenEvidence cleared to use"], majorKpiIndices: [2] },
    { id: "cc-p1-2", title: "Clarify Roles — Right People, Right Job", phase: 1, loe: 2, status: "complete", description: "Define critical roles and responsibilities. Deliberate counseling.", kpis: ["Role clarity memos published", "Counseling sessions initiated"] },
    { id: "cc-p1-3", title: "Establish Accountability — Credentials & Safety", phase: 1, loe: 2, status: "in-progress", description: "Credentials Team KPIs: FPPE closure within 6 months, OPPE on-time closures. 100% BLS compliance, timely medical record closure (72hr outpatient / 30-day inpatient).", kpis: ["Credentials team KPI: FPPE closure within six months", "OPPE on time closures", "100% BLS compliance", "Record closure compliance tracked"], majorKpiIndices: [2] },
    { id: "cc-p2-1", title: "Man to Functional Needs Analysis", phase: 2, loe: 2, status: "in-progress", description: "Unified manning document published. TDA and manning for military/civilians published. Current challenge: too many providers, not enough nurses/medics — manning is inverse to care ladder needs.", kpis: ["Unified manning document is published", "TDA and manning for military/civilians published", "Hiring medic lower level people (not just providers)"], majorKpiIndices: [0] },
    { id: "cc-p3-1", title: "Execute Deliberate Professional Development", phase: 3, loe: 2, status: "not-started", description: "Publish LPD calendar across all service lines. Focus on AI integration, best practice guidelines, and better patient care — not just workflow. All LPDs published on this portal.", kpis: ["Publish OPD calendar (published here on this page)", "Complete quarterly counseling by clinic leaders (MAJ Tobin, MAJ Chang)", "LPDs focus on AI integration and best practice guidelines"] },
    { id: "cc-p3-2", title: "Enforce Military Readiness & Education Standards", phase: 3, loe: 2, status: "not-started", description: "Set up PME timeline for all eligible providers. SOPs, protocols, and best practice guidelines established. Track military readiness.", kpis: ["Timeline for everybody to go to their next PME", "100% PME attendance for eligible (providers only)", "SOPs, protocols, and best practice guidelines established"] },
    { id: "cc-p3-3", title: "Execute Deliberate Leadership Transition Plan", phase: 3, loe: 2, status: "not-started", description: "When key leaders PCS or transition, ensure a deliberate transition plan is in place. Mentor high-potential subordinates to take ownership of key processes.", kpis: ["Deliberate plan in place when MAJ Chang leaves", "Deliberate leadership transition plan executed"] }
  ]
};

// Export for use
if (typeof module !== 'undefined') module.exports = FRAMEWORK;
