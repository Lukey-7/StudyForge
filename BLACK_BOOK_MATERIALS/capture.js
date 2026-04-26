const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const wait = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  console.log("Launching browser...");
  const browser = await puppeteer.launch({ 
    headless: 'new',
    defaultViewport: { width: 1440, height: 900 },
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  
  console.log("Navigating to StudyForge...");
  await page.goto('http://localhost:8080', { waitUntil: 'networkidle0' });

  const outDir = __dirname;

  // 1. Notebooks View (Landing/Overview)
  console.log("Waiting for Notebooks (Landing) to render...");
  await wait(2000);
  console.log("Taking Notebooks screenshot...");
  await page.screenshot({ path: path.join(outDir, 'Notebooks_View.png'), fullPage: true });

  // Let's create a notebook via UI
  console.log("Creating a notebook...");
  try {
    await page.click('#btnNewNotebookLanding');
  } catch(e) {
    await page.click('#btnNewNotebookSidebar').catch(err => console.log("Could not find new notebook button"));
  }
  
  await page.waitForSelector('#newNotebookModal', {visible: true, timeout: 5000}).catch(() => {});
  try {
    await page.type('#notebookName', 'Blackbook Capstone Project');
    await page.click('#newNotebookForm button[type="submit"]');
  } catch(e) {
    console.log("Error typing notebook name, maybe already created.");
  }
  await wait(2000); // Wait for notebook creation and navigation

  // 2. Dashboard View (Since creating a notebook might take us to the workspace/dashboard)
  console.log("Navigating to Dashboard view...");
  await page.evaluate(() => { if (window.app) window.app.switchView('dashboard'); });
  await wait(2000);
  console.log("Taking Dashboard screenshot...");
  await page.screenshot({ path: path.join(outDir, 'Dashboard_View.png'), fullPage: true });

  // 3. Documents View
  console.log("Navigating to Documents view...");
  await page.evaluate(() => { if (window.app) window.app.switchView('documents'); });
  await wait(2000);

  // Upload a sample document
  console.log("Uploading a sample document...");
  await page.evaluate(() => { if (window.app) window.app.showAddSourceModal(); });
  await wait(1000);
  
  const dummyFilePath = path.join(__dirname, 'Sample_Document.txt');
  fs.writeFileSync(dummyFilePath, "The StudyForge system acts as a cognitive knowledge base. It allows you to ingest documents and convert them into interactive study notes.\n\n# Machine Learning Basics\nSupervised learning relies on labeled training data, whereas unsupervised learning finds patterns in unlabelled data. These paradigms form the foundation of modern AI.");
  
  const fileInput = await page.$('#fileInput');
  if (fileInput) {
      await fileInput.uploadFile(dummyFilePath);
      console.log("Waiting for document to upload and process (5s)...");
      await wait(5000); // Wait for upload and processing
  }

  // Refresh Documents View
  await page.evaluate(() => { if (window.app) window.app.switchView('documents'); });
  await wait(2000);
  console.log("Taking Documents screenshot...");
  await page.screenshot({ path: path.join(outDir, 'Documents_View.png'), fullPage: true });

  // 4. Document Detail View
  console.log("Navigating to Document Detail...");
  await page.evaluate(async () => {
    if (window.app && window.app.currentNotebook) {
        try {
            const sourcesResp = await fetch(`/api/notebooks/${window.app.currentNotebook.id}/sources`, {
                headers: {'Authorization': 'Bearer ' + window.app.token}
            });
            const sources = await sourcesResp.json();
            if (sources && sources.length > 0) {
                window.app.openDocumentDetail(window.app.currentNotebook.id, sources[0].id, sources[0].name, sources[0].file_type || 'text/plain');
            }
        } catch(e) { console.error(e); }
    }
  });
  
  await wait(4000); // Wait for extraction/insights to load
  console.log("Taking Document Detail screenshot...");
  await page.screenshot({ path: path.join(outDir, 'Document_Detail_View.png'), fullPage: true });

  // 5. AI Chat View (Workspace)
  console.log("Navigating to AI Chat (Workspace) view...");
  await page.evaluate(() => { if (window.app) window.app.switchView('workspace'); });
  await wait(2000);
  console.log("Taking AI Chat screenshot...");
  await page.screenshot({ path: path.join(outDir, 'AI_Chat_View.png'), fullPage: true });

  console.log("Screenshots saved successfully in:", outDir);
  await browser.close();
})();
