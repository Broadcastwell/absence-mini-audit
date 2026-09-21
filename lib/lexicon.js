/**
 * The category lexicon: B2B software categories in the words a buyer types.
 *
 * The analyze step reads a visitor's public pages and scores every entry here against
 * what it read. The best entry becomes the proposed category, the next three become the
 * alternative chips, and the visitor always has a free text field as well.
 *
 * How to extend it (another agent can do this without reading anything else):
 *
 *   - `id`      short, stable, lower case with underscores. Never reuse an id.
 *   - `label`   the category exactly as a buyer would say it, lower case, ending in the
 *               kind of thing bought ("software", "platform", "system"). It is dropped
 *               into ten question templates such as "What is the best <label>?", so read
 *               it inside that sentence before committing.
 *   - `group`   "horizontal" for software any company buys, "vertical" for software sold
 *               to one industry.
 *   - `terms`   phrases that signal the category on a vendor's own site, lower case.
 *               Matched as whole words. Put the most specific phrases first; a phrase of
 *               two or more words counts double, because single words are ambiguous.
 *
 * Rules: no vendor names, no product names, no invented categories. Plain buyer words
 * only. Run `npm test` after an edit: the suite checks every entry for shape, duplicate
 * ids and duplicate labels, and that every label reads as a sentence in the templates.
 */

export const LEXICON = [
  // Horizontal staples
  { id: "crm", group: "horizontal", label: "CRM software", terms: ["crm", "customer relationship management", "sales pipeline", "pipeline management", "contact management", "deal tracking"] },
  { id: "project_management", group: "horizontal", label: "project management software", terms: ["project management", "task management", "work management", "gantt", "kanban", "project planning", "project tracking"] },
  { id: "core_hr", group: "horizontal", label: "HR software", terms: ["hris", "human resources", "hr software", "core hr", "employee records", "people platform", "hr platform", "onboarding"] },
  { id: "payroll", group: "horizontal", label: "payroll software", terms: ["payroll", "pay runs", "payroll processing", "contractor payments", "payslips", "global payroll"] },
  { id: "lms", group: "horizontal", label: "learning management system", terms: ["learning management", "lms", "employee training", "online courses", "elearning", "e-learning", "course authoring", "training platform"] },
  { id: "help_desk", group: "horizontal", label: "help desk software", terms: ["help desk", "helpdesk", "customer support", "ticketing", "support tickets", "service desk", "customer service software", "live chat"] },
  { id: "marketing_automation", group: "horizontal", label: "marketing automation software", terms: ["marketing automation", "email marketing", "lead nurturing", "campaign management", "drip campaigns", "lead scoring"] },
  { id: "accounting", group: "horizontal", label: "accounting software", terms: ["accounting", "bookkeeping", "general ledger", "accounts payable", "accounts receivable", "invoicing", "financial close"] },
  { id: "erp", group: "horizontal", label: "ERP software", terms: ["erp", "enterprise resource planning", "inventory and accounting", "back office"] },
  { id: "recruiting", group: "horizontal", label: "applicant tracking system", terms: ["applicant tracking", "ats", "recruiting", "recruitment", "hiring", "job postings", "talent acquisition", "candidate"] },
  { id: "expense", group: "horizontal", label: "expense management software", terms: ["expense management", "expense reports", "corporate cards", "spend management", "receipts"] },
  { id: "procurement", group: "horizontal", label: "procurement software", terms: ["procurement", "purchase orders", "sourcing", "supplier management", "vendor management", "procure to pay"] },
  { id: "contract_management", group: "horizontal", label: "contract management software", terms: ["contract management", "contract lifecycle", "clm", "contract repository", "e-signature", "esignature"] },
  { id: "bi", group: "horizontal", label: "business intelligence software", terms: ["business intelligence", "dashboards", "data visualization", "analytics platform", "reporting and analytics", "self service analytics"] },
  { id: "cybersecurity", group: "horizontal", label: "cybersecurity software", terms: ["cybersecurity", "endpoint security", "threat detection", "security operations", "siem", "zero trust", "vulnerability management"] },
  { id: "itsm", group: "horizontal", label: "IT service management software", terms: ["it service management", "itsm", "it asset management", "incident management", "it help desk", "change management"] },
  { id: "customer_success", group: "horizontal", label: "customer success software", terms: ["customer success", "churn", "health scores", "renewals", "customer retention"] },
  { id: "sales_engagement", group: "horizontal", label: "sales engagement platform", terms: ["sales engagement", "sales cadences", "outbound", "sales sequences", "prospecting"] },
  { id: "cms", group: "horizontal", label: "content management system", terms: ["content management", "cms", "headless cms", "website builder", "digital experience"] },
  { id: "ecommerce", group: "horizontal", label: "ecommerce platform", terms: ["ecommerce", "e-commerce", "online store", "shopping cart", "storefront", "b2b commerce"] },
  { id: "scheduling", group: "horizontal", label: "appointment scheduling software", terms: ["appointment scheduling", "online booking", "booking software", "scheduling software", "calendar booking"] },
  { id: "workforce", group: "horizontal", label: "workforce management software", terms: ["workforce management", "employee scheduling", "time and attendance", "shift scheduling", "timesheets", "time tracking"] },
  { id: "document_management", group: "horizontal", label: "document management software", terms: ["document management", "file sharing", "records management", "document storage", "document workflow"] },
  { id: "collaboration", group: "horizontal", label: "team collaboration software", terms: ["team collaboration", "team chat", "internal communication", "intranet", "knowledge base", "wiki"] },
  { id: "customer_data", group: "horizontal", label: "customer data platform", terms: ["customer data platform", "cdp", "customer data", "identity resolution", "audience segmentation"] },
  { id: "product_analytics", group: "horizontal", label: "product analytics software", terms: ["product analytics", "user analytics", "event tracking", "funnels", "session replay"] },
  { id: "devops", group: "horizontal", label: "DevOps platform", terms: ["devops", "ci/cd", "continuous integration", "continuous delivery", "deployment pipeline", "observability", "monitoring"] },
  { id: "payments", group: "horizontal", label: "payment processing software", terms: ["payment processing", "payments platform", "merchant services", "online payments", "billing and payments"] },
  { id: "subscription_billing", group: "horizontal", label: "subscription billing software", terms: ["subscription billing", "recurring billing", "usage based billing", "revenue recognition", "subscription management"] },
  { id: "fpa", group: "horizontal", label: "financial planning software", terms: ["financial planning", "fp&a", "budgeting", "forecasting", "financial modeling"] },
  { id: "survey", group: "horizontal", label: "survey software", terms: ["survey", "surveys", "feedback", "forms", "questionnaire", "nps"] },
  { id: "compliance_grc", group: "horizontal", label: "compliance management software", terms: ["compliance management", "governance risk and compliance", "grc", "soc 2", "audit management", "risk management", "policy management"] },
  { id: "inventory", group: "horizontal", label: "inventory management software", terms: ["inventory management", "stock control", "warehouse management", "wms", "order management", "barcode"] },
  { id: "ai_visibility", group: "horizontal", label: "AI visibility software", terms: ["ai visibility", "generative engine optimization", "ai search visibility", "answer engine optimization"] },

  // Vertical software
  { id: "dealership", group: "vertical", label: "dealership management software", terms: ["dealership management", "dealer management system", "dms", "auto dealers", "car dealership", "dealerships", "f&i"] },
  { id: "field_service", group: "vertical", label: "field service management software", terms: ["field service management", "field service", "the trades", "trades", "home services", "service visits", "service businesses", "service business", "home and commercial contractors", "dispatch", "technicians", "work orders", "service technicians", "fsm", "hvac", "plumbing"] },
  { id: "radiology", group: "vertical", label: "radiology software", terms: ["radiology", "pacs", "ris", "medical imaging", "imaging centers", "radiologists", "dicom"] },
  { id: "dental", group: "vertical", label: "dental practice management software", terms: ["dental practice", "dental software", "dentists", "dental offices", "orthodontic", "dental clinics"] },
  { id: "veterinary", group: "vertical", label: "veterinary practice management software", terms: ["veterinary", "vet clinics", "animal hospitals", "veterinarians", "pet health"] },
  { id: "behavioral_health", group: "vertical", label: "behavioral health EHR", terms: ["behavioral health", "behavioural health", "mental health", "therapy practice", "substance use", "addiction treatment", "therapists", "counseling"] },
  { id: "home_health", group: "vertical", label: "home health software", terms: ["home health", "home care", "hospice", "private duty", "caregivers", "evv", "electronic visit verification"] },
  { id: "pharmacy", group: "vertical", label: "pharmacy management system", terms: ["pharmacy management", "pharmacy software", "pharmacies", "pharmacists", "dispensing", "prescriptions"] },
  { id: "medical_billing", group: "vertical", label: "medical billing software", terms: ["medical billing", "revenue cycle management", "rcm", "claims scrubbing", "medical coding", "denial management", "healthcare billing"] },
  { id: "ehr", group: "vertical", label: "EHR software", terms: ["electronic health records", "ehr", "emr", "electronic medical records", "patient charting", "clinical documentation"] },
  { id: "legal_practice", group: "vertical", label: "legal practice management software", terms: ["legal practice management", "law firms", "law practice", "case management", "legal billing", "attorneys", "matter management"] },
  { id: "accounting_practice", group: "vertical", label: "accounting practice management software", terms: ["accounting practice management", "accounting firms", "cpa firms", "tax practice", "tax preparers", "bookkeeping firms", "practice management for accountants"] },
  { id: "optometry", group: "vertical", label: "optometry practice management software", terms: ["optometry", "optometrists", "eye care", "optical", "ophthalmology"] },
  { id: "chiropractic", group: "vertical", label: "chiropractic software", terms: ["chiropractic", "chiropractors", "chiropractic practice"] },
  { id: "physical_therapy", group: "vertical", label: "physical therapy software", terms: ["physical therapy", "physiotherapy", "rehab therapy", "pt clinics", "occupational therapy"] },
  { id: "construction", group: "vertical", label: "construction management software", terms: ["construction project management software", "construction project management", "construction management", "construction software", "construction projects", "construction", "contractors", "general contractors", "subcontractors", "job costing", "bid management", "punch list"] },
  { id: "property_management", group: "vertical", label: "property management software", terms: ["property management", "property managers", "landlords", "tenants", "rent collection", "leasing", "multifamily", "hoa management"] },
  { id: "self_storage", group: "vertical", label: "self storage management software", terms: ["self storage", "storage facilities", "storage units", "storage operators"] },
  { id: "title_escrow", group: "vertical", label: "title and escrow software", terms: ["title and escrow", "title insurance", "escrow", "settlement agents", "real estate closings", "title agents"] },
  { id: "mortgage", group: "vertical", label: "mortgage loan origination software", terms: ["mortgage", "loan origination", "mortgage lenders", "los", "mortgage brokers", "point of sale for lenders"] },
  { id: "insurance_agency", group: "vertical", label: "insurance agency management software", terms: ["insurance agency management", "insurance agencies", "agency management system", "independent agents", "insurance brokers"] },
  { id: "claims", group: "vertical", label: "claims management software", terms: ["claims management", "claims processing", "insurance claims", "claims adjusters", "first notice of loss", "fnol"] },
  { id: "policy_admin", group: "vertical", label: "insurance policy administration software", terms: ["policy administration", "insurance carriers", "underwriting", "insurers", "rating engine"] },
  { id: "credit_union", group: "vertical", label: "credit union core banking software", terms: ["credit union", "credit unions", "core banking", "core processor", "member services", "community banks"] },
  { id: "lending", group: "vertical", label: "lending software", terms: ["lending", "loan servicing", "commercial lending", "consumer lending", "loan management", "lenders"] },
  { id: "wealth", group: "vertical", label: "wealth management software", terms: ["wealth management", "financial advisors", "portfolio management", "ria", "advisors", "investment management"] },
  { id: "restaurant", group: "vertical", label: "restaurant management software", terms: ["restaurant", "restaurants", "restaurant pos", "point of sale", "online ordering", "kitchen display", "hospitality"] },
  { id: "hotel", group: "vertical", label: "hotel management software", terms: ["hotel management", "property management system for hotels", "hotels", "hoteliers", "channel manager", "booking engine", "vacation rentals"] },
  { id: "salon_spa", group: "vertical", label: "salon and spa software", terms: ["salon", "salons", "spa", "spas", "barbershops", "beauty businesses", "med spa"] },
  { id: "fitness", group: "vertical", label: "gym management software", terms: ["gym management", "gyms", "fitness studios", "fitness clubs", "boutique fitness", "membership management", "yoga studios"] },
  { id: "tms", group: "vertical", label: "transportation management system", terms: ["transportation management", "tms", "shippers", "freight management", "load planning", "carrier management"] },
  { id: "fleet", group: "vertical", label: "fleet management software", terms: ["fleet management", "fleet tracking", "telematics", "gps tracking", "vehicle tracking", "fleets", "eld"] },
  { id: "freight_brokerage", group: "vertical", label: "freight brokerage software", terms: ["freight brokerage", "freight brokers", "brokerage tms", "load boards", "3pl"] },
  { id: "agriculture", group: "vertical", label: "farm management software", terms: ["farm management", "agriculture", "agricultural", "growers", "farms", "agronomy", "crop"] },
  { id: "energy", group: "vertical", label: "energy management software", terms: ["energy management", "utilities", "utility billing", "renewable energy", "solar", "oil and gas", "energy data"] },
  { id: "k12", group: "vertical", label: "K-12 school management software", terms: ["k-12", "k12", "school districts", "student information system", "sis", "schools", "teachers", "classroom"] },
  { id: "higher_ed", group: "vertical", label: "higher education software", terms: ["higher education", "universities", "colleges", "campus", "admissions", "student success", "enrollment management"] },
  { id: "church", group: "vertical", label: "church management software", terms: ["church management", "churches", "church", "ministry", "congregation", "online giving", "faith"] },
  { id: "nonprofit_crm", group: "vertical", label: "nonprofit CRM", terms: ["nonprofit", "nonprofits", "donor management", "fundraising", "donors", "charities", "grant management"] },
  { id: "public_safety", group: "vertical", label: "public safety software", terms: ["public safety", "computer aided dispatch", "cad", "law enforcement", "records management system", "first responders", "police", "911"] },
  { id: "government", group: "vertical", label: "government software", terms: ["local government", "government agencies", "permitting", "municipalities", "public sector", "citizen services"] },
  { id: "mes", group: "vertical", label: "manufacturing execution system", terms: ["manufacturing execution", "mes", "shop floor", "production scheduling", "manufacturers", "manufacturing", "oee"] },
  { id: "quality", group: "vertical", label: "quality management software", terms: ["quality management", "qms", "capa", "nonconformance", "iso 9001", "document control", "quality assurance"] },
  { id: "food_safety", group: "vertical", label: "food safety software", terms: ["food safety", "haccp", "fsma", "food manufacturers", "food traceability", "sqf"] },
  { id: "equipment_rental", group: "vertical", label: "equipment rental software", terms: ["equipment rental", "rental management", "rental software", "rental fleet", "party rental", "tool rental"] },
  { id: "real_estate_crm", group: "vertical", label: "real estate CRM", terms: ["real estate agents", "realtors", "brokerages", "real estate crm", "listings", "mls"] },
  { id: "senior_living", group: "vertical", label: "senior living software", terms: ["senior living", "assisted living", "long term care", "skilled nursing", "memory care"] },
  { id: "childcare", group: "vertical", label: "childcare management software", terms: ["childcare", "child care", "daycare", "preschools", "early education"] },
  { id: "clinical_trials", group: "vertical", label: "clinical trial management software", terms: ["clinical trials", "ctms", "clinical research", "edc", "sponsors and cros", "cro"] },
  { id: "lab", group: "vertical", label: "laboratory information management system", terms: ["laboratory information", "lims", "laboratories", "labs", "sample tracking"] },
  { id: "automotive_repair", group: "vertical", label: "auto repair shop software", terms: ["auto repair", "repair shops", "collision repair", "body shops", "service writers"] },
  { id: "logistics_warehouse", group: "vertical", label: "warehouse management system", terms: ["warehouse management system", "fulfillment centers", "3pl warehouses", "pick and pack", "distribution centers"] },
  { id: "events", group: "vertical", label: "event management software", terms: ["event management", "event registration", "conferences", "virtual events", "event planners", "ticketing platform"] },
  { id: "association", group: "vertical", label: "association management software", terms: ["association management", "associations", "membership organizations", "ams", "chapters", "member dues"] },
  { id: "funeral", group: "vertical", label: "funeral home software", terms: ["funeral home", "funeral homes", "cemetery", "cremation", "funeral directors"] },
  { id: "landscaping", group: "vertical", label: "landscaping business software", terms: ["landscaping", "lawn care", "snow removal", "landscapers", "tree care"] },
  { id: "cleaning", group: "vertical", label: "cleaning business software", terms: ["cleaning business", "janitorial", "commercial cleaning", "maid service", "cleaning companies"] },
  { id: "pest_control", group: "vertical", label: "pest control software", terms: ["pest control", "exterminators", "termite", "pest management"] },
  { id: "security_guard", group: "vertical", label: "security guard management software", terms: ["security guard", "guard tour", "security companies", "patrol management"] },
];

// Every question the upstream asks is one of these ten sentences with the category
// dropped in. Kept here as the shape a label must read well inside; lib/audit.js holds
// the templates themselves.
export const LABEL_SENTENCE = (label) => "What is the best " + label + "?";
