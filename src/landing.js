// Landing pages for specific searches ("jpg to pdf under 200kb", "compress pdf for job application").
// Each one opens an existing tool already set up for that job, with its own copy for search engines.
// Pure data, no imports: loaded by the app, the command palette and scripts/prerender.mjs.
//
// Fields: slug, tool, group ('size' | 'combine' | 'task'), name (H1), title (<= ~60 chars),
// description (<= ~155 chars), lead, about (a short paragraph that's unique to the page),
// steps, faq ([question, answer] pairs specific to the page), keywords (palette search),
// preset: { target (bytes) | level | workflow: [{ type, opts }] }.
//
// Only state limits you've verified. Where a site's upload limit varies, say "check the form".

const KB = 1024
const MB = 1024 * 1024

const SIZES = [
  { slug: '100kb', label: '100 KB', bytes: 100 * KB },
  { slug: '200kb', label: '200 KB', bytes: 200 * KB },
  { slug: '500kb', label: '500 KB', bytes: 500 * KB },
  { slug: '1mb', label: '1 MB', bytes: 1 * MB },
  { slug: '2mb', label: '2 MB', bytes: 2 * MB },
]

const compressTo = SIZES.map((s) => ({
  slug: `compress-pdf-to-${s.slug}`,
  tool: 'compress-pdf',
  group: 'size',
  name: `Compress PDF to ${s.label}`,
  title: `Compress PDF to ${s.label} — Free, No Upload`,
  description: `Reduce a PDF to under ${s.label} for job portals, admissions and government forms. Runs in your browser — files never leave your device. Free, no sign-up.`,
  lead: `Shrink your PDF to under ${s.label} — the right size for online forms, job portals and email.`,
  about: `Upload forms often reject anything over ${s.label}. PDFwise tries several image-quality settings and keeps the sharpest version that still fits, so you don’t have to guess. Text and vector graphics are never blurred — only the photos and scans inside the PDF are re-encoded.`,
  steps: [
    'Select or drop your PDF files.',
    `The target is already set to ${s.label} — change it if your form asks for a different size.`,
    'Click “Compress PDF” and download the result.',
  ],
  faq: [
    [
      `What if my PDF can’t get under ${s.label}?`,
      'You still get the smallest version possible, and PDFwise tells you its size. If most of the file is text and fonts rather than images, try removing pages you don’t need first.',
    ],
  ],
  keywords: [`pdf ${s.slug}`, `pdf under ${s.slug}`, 'reduce size'],
  preset: { target: s.bytes },
}))

const imagesTo = SIZES.slice(0, 4).map((s) => ({
  slug: `jpg-to-pdf-under-${s.slug}`,
  tool: 'pdf-workflows',
  group: 'combine',
  name: `JPG to PDF under ${s.label}`,
  title: `JPG to PDF under ${s.label} — Free, No Upload`,
  description: `Turn photos or scans (JPG, PNG, WebP) into one PDF smaller than ${s.label}, in one step. Runs in your browser — nothing is uploaded. Free, no sign-up.`,
  lead: `Photos or scans in, one PDF under ${s.label} out — in a single click.`,
  about: `Phone photos are large, so a PDF made from a few of them is often several megabytes — too big for most upload forms. This page converts your images to a PDF and then compresses it to fit under ${s.label}, keeping the best quality that fits.`,
  steps: [
    'Select or drop your images — JPG, PNG or WebP.',
    `Check the order and the ${s.label} target.`,
    'Click “Run 2 steps” and download your PDF.',
  ],
  faq: [
    [
      'Can I change the page size?',
      'Yes. Open the “Images to PDF” step to choose A4, Letter, or pages that fit each image.',
    ],
    ['What order will the images be in?', 'The order you added them. Remove and re-add files to change it.'],
  ],
  keywords: [`image to pdf ${s.slug}`, `photo to pdf under ${s.slug}`, 'png to pdf small'],
  preset: {
    workflow: [
      { type: 'images-to-pdf', opts: { size: 'a4' } },
      { type: 'compress', opts: { mode: 'target', target: s.bytes } },
    ],
  },
}))

const mergeTo = SIZES.slice(3).map((s) => ({
  slug: `merge-pdf-under-${s.slug}`,
  tool: 'pdf-workflows',
  group: 'combine',
  name: `Merge PDF under ${s.label}`,
  title: `Merge PDF Files Under ${s.label} — Free, No Upload`,
  description: `Combine several PDFs into one file smaller than ${s.label}, in one step. Runs in your browser — files never leave your device. Free, no sign-up.`,
  lead: `Join your PDFs into one file and keep it under ${s.label} — in a single click.`,
  about: `Merging documents adds up their sizes, so the combined file often ends up too big to upload or attach. This page merges your PDFs and then compresses the result to fit under ${s.label}.`,
  steps: [
    'Select or drop all your PDFs.',
    `Check the order and the ${s.label} target.`,
    'Click “Run 2 steps” and download one merged PDF.',
  ],
  faq: [['Can I name the merged file?', 'Yes. Open the “Merge” step and type a file name.']],
  keywords: [`combine pdf ${s.slug}`, `join pdf under ${s.slug}`],
  preset: {
    workflow: [
      { type: 'merge', opts: { name: 'merged' } },
      { type: 'compress', opts: { mode: 'target', target: s.bytes } },
    ],
  },
}))

const tasks = [
  {
    slug: 'compress-pdf-for-email',
    tool: 'compress-pdf',
    name: 'Compress PDF for email',
    title: 'Compress PDF for Email — Free, No Upload',
    description:
      'Make a PDF small enough to attach and quick to open on any phone. Runs in your browser — files never leave your device. Free, no sign-up.',
    lead: 'Shrink a PDF so it attaches easily and opens fast on any phone.',
    about:
      'Gmail lets you attach up to 25 MB, and larger files are turned into Drive links. Many work and school mail systems allow less, and big attachments are slow to open on phones. A PDF under about 2 MB is comfortable almost everywhere — that’s the preset here.',
    steps: [
      'Select or drop your PDF files.',
      'The target is set to 2 MB — change it if you need to.',
      'Click “Compress PDF”, download, and attach.',
    ],
    faq: [
      [
        'Should I zip the PDF instead?',
        'Zipping barely shrinks a PDF, because its images are already compressed. Re-encoding the images, as PDFwise does, saves far more.',
      ],
    ],
    keywords: ['email attachment too large', 'gmail pdf size', 'outlook pdf'],
    preset: { target: 2 * MB },
  },
  {
    slug: 'compress-pdf-for-job-application',
    tool: 'compress-pdf',
    name: 'Compress PDF for a job application',
    title: 'Compress PDF for Job Applications — Free, Private',
    description:
      'Get your CV, certificates and cover letter under the upload limit of any job portal. Runs in your browser — nothing is uploaded. Free, no sign-up.',
    lead: 'Get your CV and certificates under the job portal’s upload limit.',
    about:
      'Job portals usually state a maximum file size next to each upload field — commonly somewhere between a few hundred KB and a few MB. Check the limit on the form, set it here, and PDFwise keeps your documents as sharp as possible within it. Your CV never leaves your device.',
    steps: [
      'Select or drop your CV and documents.',
      'Set the size the job portal asks for (500 KB is preset).',
      'Click “Compress PDF” and upload the result.',
    ],
    faq: [
      [
        'Will my CV text stay sharp?',
        'Yes. Text and vector graphics are never re-encoded — only photos and scans inside the PDF are.',
      ],
      [
        'I need everything in one file.',
        'Use “Combine documents for an application”, which merges, numbers and compresses in one step.',
      ],
    ],
    keywords: ['cv pdf size', 'resume pdf too large', 'job portal upload'],
    preset: { target: 500 * KB },
  },
  {
    slug: 'compress-pdf-for-university-admission',
    tool: 'compress-pdf',
    name: 'Compress PDF for university admission',
    title: 'Compress PDF for University Admission Forms — Free',
    description:
      'Shrink transcripts, certificates and ID scans to fit admission portal limits. Runs in your browser — files never leave your device. Free, no sign-up.',
    lead: 'Fit transcripts, certificates and ID scans within the admission portal’s limits.',
    about:
      'Admission portals often ask for each document as a separate PDF with its own size limit, and scanned certificates are usually the ones that are too big. Add all your documents at once — each one is compressed separately to the size you set, and you download them together.',
    steps: [
      'Select or drop all your scanned documents.',
      'Set the limit from the admission form (500 KB is preset).',
      'Click “Compress PDF” and download them as a ZIP.',
    ],
    faq: [
      [
        'My scan is a photo, not a PDF.',
        'Use “Scan documents to PDF” first — it turns phone photos into a compact PDF.',
      ],
    ],
    keywords: ['admission form pdf size', 'transcript pdf', 'certificate scan size'],
    preset: { target: 500 * KB },
  },
  {
    slug: 'compress-pdf-for-visa-application',
    tool: 'compress-pdf',
    name: 'Compress PDF for a visa application',
    title: 'Compress PDF for Visa Applications — Free, Private',
    description:
      'Reduce bank statements, passport scans and supporting documents to the visa portal’s size limit — privately, in your browser. Free, no sign-up.',
    lead: 'Shrink bank statements and passport scans to the visa portal’s limit — privately.',
    about:
      'Visa and immigration portals list an upload limit next to each document. These files hold sensitive details — passport numbers, bank balances — so PDFwise compresses them on your own device. Nothing is uploaded anywhere.',
    steps: [
      'Select or drop your documents.',
      'Set the limit stated on the visa form (1 MB is preset).',
      'Click “Compress PDF” and upload the result to the official portal.',
    ],
    faq: [
      [
        'Is it safe for passport and bank documents?',
        'Yes. The files are processed inside your browser and never sent to a server. You can even use PDFwise offline.',
      ],
    ],
    keywords: ['immigration pdf size', 'bank statement pdf', 'passport scan size'],
    preset: { target: 1 * MB },
  },
  {
    slug: 'compress-pdf-without-losing-quality',
    tool: 'compress-pdf',
    name: 'Compress PDF without losing quality',
    title: 'Compress PDF Without Losing Quality — Free, No Upload',
    description:
      'Make a PDF smaller while keeping text crisp and photos sharp. Runs in your browser — files never leave your device. Free, no sign-up.',
    lead: 'Smaller files with crisp text and sharp photos.',
    about:
      'PDFwise never touches text, fonts or vector graphics, so they stay perfectly sharp. With “Less compression” selected, photos keep up to 2600 pixels on the long side at high JPEG quality — differences are hard to spot, while large scans still shrink a lot. If the result wouldn’t be smaller, you get your original back.',
    steps: [
      'Select or drop your PDF files.',
      '“Less compression” is preselected for the best quality.',
      'Click “Compress PDF” and compare the sizes.',
    ],
    faq: [
      [
        'Why is my file barely smaller?',
        'It’s probably mostly text and vector graphics, which are already compact. Compression helps most with photos and scans.',
      ],
    ],
    keywords: ['high quality compress', 'lossless pdf compress', 'keep quality'],
    preset: { level: 'low' },
  },
  {
    slug: 'reduce-pdf-size-on-phone',
    tool: 'compress-pdf',
    name: 'Reduce PDF size on your phone',
    title: 'Reduce PDF Size on Android or iPhone — Free',
    description:
      'Shrink a PDF right on your phone — no app download, no upload, no sign-up. Works on Android and iPhone, even offline once installed.',
    lead: 'Shrink a PDF right on your phone — no app store, no upload.',
    about:
      'Everything runs inside your phone’s browser, so your file never leaves it. Tap “Install app” in the header to add PDFwise to your home screen: it then works offline, and on Android you can share PDFs straight into it from WhatsApp, Gmail or Files.',
    steps: [
      'Tap “Select PDF files” and pick the PDF from your phone.',
      'Keep “Recommended”, or switch to “Target size”.',
      'Tap “Compress PDF” and save the result.',
    ],
    faq: [
      [
        'Do I need to install anything?',
        'No. It works in Chrome, Safari or any modern browser. Installing is optional and just adds offline use and sharing.',
      ],
    ],
    keywords: ['mobile pdf compress', 'android pdf size', 'iphone pdf size'],
    preset: { level: 'recommended' },
  },
  {
    slug: 'combine-documents-for-application',
    tool: 'pdf-workflows',
    name: 'Combine documents for an application',
    title: 'Combine Documents Into One PDF for Applications — Free',
    description:
      'Merge your CV, certificates and letters into one numbered PDF under 500 KB, in one click. Runs in your browser — nothing is uploaded.',
    lead: 'CV, certificates and letters → one numbered PDF under 500 KB, in one click.',
    about:
      'Many application forms want a single PDF with everything in it. This page merges your documents in order, adds “Page 1 of N” numbers so reviewers can find their place, and compresses the result to 500 KB. Change any step — or the size — before you run it.',
    steps: [
      'Select or drop all your PDFs.',
      'Check the order, the file name and the 500 KB target.',
      'Click “Run 3 steps” and upload one tidy PDF.',
    ],
    faq: [
      ['Some of my documents are photos.', 'Convert them first with “JPG to PDF under 500 KB”, then add the PDF here.'],
    ],
    keywords: ['application pack', 'one pdf for application', 'merge cv certificates'],
    preset: {
      workflow: [
        { type: 'merge', opts: { name: 'application' } },
        { type: 'page-numbers', opts: { format: 'Page {n} of {total}', position: 'bottom-center' } },
        { type: 'compress', opts: { mode: 'target', target: 500 * KB } },
      ],
    },
  },
  {
    slug: 'scan-documents-to-pdf',
    tool: 'pdf-workflows',
    name: 'Scan documents to PDF',
    title: 'Scan Documents to PDF With Your Phone — Free',
    description:
      'Turn phone photos of documents into one compact PDF under 1 MB. Works in your browser on Android and iPhone — nothing is uploaded.',
    lead: 'Photos of your documents → one compact PDF, right on your phone.',
    about:
      'Take a photo of each page with your phone camera, then add them here. PDFwise puts them on A4 pages in one PDF and compresses it under 1 MB, so it’s ready to email or upload. To make the text searchable, add an “OCR” step before running.',
    steps: [
      'Photograph each page, then select or drop the photos.',
      'Check the order and the 1 MB target.',
      'Click “Run 2 steps” and download your PDF.',
    ],
    faq: [
      [
        'Can I make the scanned text searchable?',
        'Yes. Click “Add step”, choose “OCR (searchable text)” and move it after “Images to PDF”.',
      ],
    ],
    keywords: ['phone scanner', 'camera to pdf', 'photo document to pdf'],
    preset: {
      workflow: [
        { type: 'images-to-pdf', opts: { size: 'a4' } },
        { type: 'compress', opts: { mode: 'target', target: 1 * MB } },
      ],
    },
  },
  {
    slug: 'password-protect-pdf-for-email',
    tool: 'protect-pdf',
    name: 'Password protect a PDF for email',
    title: 'Password Protect a PDF Before Emailing — Free',
    description:
      'Lock a PDF with AES-256 encryption before you email it. Runs in your browser — the file and password never leave your device. Free, no sign-up.',
    lead: 'Lock a PDF with AES-256 before it leaves your hands.',
    about:
      'Email can be forwarded, misdirected or read on a shared computer. Locking the PDF means only people with the password can open it. Send the password a different way — a text message or a call — never in the same email.',
    steps: [
      'Select or drop the PDF.',
      'Type a strong password (and choose any restrictions).',
      'Click “Protect PDF”, then email the file and share the password separately.',
    ],
    faq: [
      [
        'What if I forget the password?',
        'It can’t be recovered — that’s what makes it secure. Keep a copy of the unlocked original.',
      ],
    ],
    keywords: ['encrypt pdf email', 'secure pdf attachment', 'lock pdf'],
    preset: {},
  },
].map((p) => ({ ...p, group: 'task' }))

export const LANDING_PAGES = [...compressTo, ...imagesTo, ...mergeTo, ...tasks]

export const LANDING_GROUPS = [
  { id: 'task', label: 'Popular tasks' },
  { id: 'size', label: 'Compress PDF to a size' },
  { id: 'combine', label: 'Make one PDF under a size' },
]
