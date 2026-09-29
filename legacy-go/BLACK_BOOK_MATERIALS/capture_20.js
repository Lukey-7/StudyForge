const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const wait = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  console.log("Launching browser for 20+ comprehensive screenshots...");
  const browser = await puppeteer.launch({ 
    headless: 'new',
    defaultViewport: { width: 1440, height: 900 },
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  const outDir = __dirname;
  
  console.log("Navigating to StudyForge...");
  await page.goto('http://localhost:8080', { waitUntil: 'networkidle0' });
  await wait(2000);

  // 1. Dashboard
  console.log("1. Capturing Dashboard");
  await page.evaluate(() => { if (window.app) window.app.switchView('dashboard'); });
  await wait(1000);
  await page.screenshot({ path: path.join(outDir, '01_Dashboard.png'), fullPage: true });

  // 2. New Notebook Modal
  console.log("2. Capturing New Notebook Modal");
  await page.evaluate(() => { if (window.app) window.app.showNewNotebookModal(); });
  await wait(1000);
  await page.screenshot({ path: path.join(outDir, '02_New_Notebook_Modal.png'), fullPage: true });

  await page.type('#newNotebookForm input[name="name"]', 'Advanced AI Architectures');
  await page.evaluate(() => {
    const btn = document.querySelector('#newNotebookForm button[type="submit"]');
    if (btn) btn.click();
  });
  console.log("Waiting for notebook to be created...");
  await wait(2000); 

  // 3. Notebooks List
  console.log("3. Capturing Notebooks List");
  await page.evaluate(() => { if (window.app) window.app.switchView('landing'); });
  await wait(1000);
  await page.screenshot({ path: path.join(outDir, '03_Notebooks_List.png'), fullPage: true });

  // 4. Add Source Modal (File)
  console.log("4. Capturing Add Source Modal (File)");
  await page.evaluate(() => { if (window.app) window.app.showAddSourceModal(); });
  await wait(1000);
  await page.screenshot({ path: path.join(outDir, '04_Add_Source_File.png'), fullPage: true });

  // 5. Add Source Modal (Text)
  console.log("5. Capturing Add Source Modal (Text)");
  await page.evaluate(() => {
     const tab = document.querySelector('.source-tab[data-source="text"]');
     if (tab) tab.click();
  });
  await wait(500);
  await page.screenshot({ path: path.join(outDir, '05_Add_Source_Text.png'), fullPage: true });

  // 6. Add Source Modal (URL)
  console.log("6. Capturing Add Source Modal (URL)");
  await page.evaluate(() => {
     const tab = document.querySelector('.source-tab[data-source="url"]');
     if (tab) tab.click();
  });
  await wait(500);
  await page.screenshot({ path: path.join(outDir, '06_Add_Source_URL.png'), fullPage: true });

  // Add a text source
  console.log("Adding text source...");
  await page.evaluate(() => {
     const tab = document.querySelector('.source-tab[data-source="text"]');
     if (tab) tab.click();
  });
  await wait(500);
  await page.type('#textSourceForm input[name="name"]', 'Neural Networks Overview');
  await page.type('#textSourceForm textarea[name="content"]', 'Neural networks are computing systems inspired by the biological neural networks that constitute animal brains. An ANN is based on a collection of connected units or nodes called artificial neurons.');
  await page.evaluate(() => {
    const btn = document.querySelector('#textSourceForm button[type="submit"]');
    if (btn) btn.click();
  });
  await wait(4000);

  // Add another file source to populate the grid
  console.log("Adding file source...");
  await page.evaluate(() => { if (window.app) window.app.showAddSourceModal(); });
  await wait(1000);
  const dummyFilePath = path.join(__dirname, 'Sample_Document.txt');
  fs.writeFileSync(dummyFilePath, "The StudyForge system acts as a cognitive knowledge base. It allows you to ingest documents and convert them into interactive study notes.");
  const fileInput = await page.$('#fileInput');
  if (fileInput) {
      await fileInput.uploadFile(dummyFilePath);
      await wait(5000); 
  }

  // 7. Documents View All
  console.log("7. Capturing Documents View");
  await page.evaluate(() => { if (window.app) window.app.switchView('documents'); });
  await wait(1500);
  await page.screenshot({ path: path.join(outDir, '07_Documents_All.png'), fullPage: true });

  // 8. Documents View Filtered
  console.log("8. Capturing Documents Filtered");
  await page.evaluate(() => { 
      const tabs = document.querySelectorAll('#docsFilterBar .sf-filter-tab');
      for (let t of tabs) { if (t.dataset.filter === 'text/plain') t.click(); }
  });
  await wait(1000);
  await page.screenshot({ path: path.join(outDir, '08_Documents_Filtered.png'), fullPage: true });

  // 9. Workspace Default
  console.log("9. Capturing Workspace Default");
  await page.evaluate(() => { if (window.app) window.app.switchView('workspace'); });
  await wait(2000);
  await page.screenshot({ path: path.join(outDir, '09_Workspace_Default.png'), fullPage: true });

  // 10. Workspace Chat
  console.log("10. Capturing Workspace Chat");
  await page.evaluate(() => { if (window.app) window.app.switchPanelTab('chat'); });
  await wait(1000);
  await page.screenshot({ path: path.join(outDir, '10_Workspace_Chat.png'), fullPage: true });

  // 11. Workspace Chat Typing
  console.log("11. Capturing Workspace Chat Typing");
  const chatInput = await page.$('#chatInput');
  if (chatInput) await chatInput.type('What is an artificial neuron?');
  await page.screenshot({ path: path.join(outDir, '11_Workspace_Chat_Typing.png'), fullPage: true });
  
  // 12. Workspace Chat Response
  console.log("12. Capturing Workspace Chat Response");
  const sendBtn = await page.$('#btnSend');
  if (sendBtn) await sendBtn.click();
  await wait(5000);
  await page.screenshot({ path: path.join(outDir, '12_Workspace_Chat_Response.png'), fullPage: true });

  // 13. Studio Summary
  console.log("13. Capturing Studio Summary");
  await page.evaluate(() => { if (window.app) window.app.switchPanelTab('studio'); });
  await wait(1000);
  await page.evaluate(() => {
      const btn = document.querySelector('.transform-card[data-type="summary"]');
      if (btn) btn.click();
  });
  await wait(5000);
  await page.screenshot({ path: path.join(outDir, '13_Studio_Summary.png'), fullPage: true });

  // 14. Studio FAQ
  console.log("14. Capturing Studio FAQ");
  await page.evaluate(() => { if (window.app) window.app.switchPanelTab('studio'); });
  await wait(1000);
  await page.evaluate(() => {
      const btn = document.querySelector('.transform-card[data-type="faq"]');
      if (btn) btn.click();
  });
  await wait(5000);
  await page.screenshot({ path: path.join(outDir, '14_Studio_FAQ.png'), fullPage: true });

  // 15. Studio Exam Notes
  console.log("15. Capturing Studio Exam Notes");
  await page.evaluate(() => { if (window.app) window.app.switchPanelTab('studio'); });
  await wait(1000);
  await page.evaluate(() => {
      const btn = document.querySelector('.transform-card[data-type="exam_notes"]');
      if (btn) btn.click();
  });
  await wait(5000);
  await page.screenshot({ path: path.join(outDir, '15_Studio_ExamNotes.png'), fullPage: true });

  // 16. Notes List
  console.log("16. Capturing Notes List");
  await page.evaluate(() => { if (window.app) window.app.showNotesListTab(); });
  await wait(1500);
  await page.screenshot({ path: path.join(outDir, '16_Workspace_NotesList.png'), fullPage: true });

  // 17. Share Modal
  console.log("17. Capturing Share Modal");
  await page.evaluate(() => { if (window.app && window.app.currentNotebook) window.app.showShareDialog(window.app.currentNotebook); });
  await wait(1000);
  await page.screenshot({ path: path.join(outDir, '17_Share_Modal.png'), fullPage: true });
  await page.evaluate(() => { if (window.app) window.app.closeShareModal(); });
  await wait(500);

  // 18. Settings View
  console.log("18. Capturing Settings View");
  await page.evaluate(() => { if (window.app) window.app.switchView('settings'); });
  await wait(1000);
  await page.screenshot({ path: path.join(outDir, '18_Settings_View.png'), fullPage: true });

  // 19. Document Detail View
  console.log("19. Capturing Document Detail View");
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
  await wait(5000);
  await page.screenshot({ path: path.join(outDir, '19_Document_Detail.png'), fullPage: true });

  // 20. Mobile Dashboard
  console.log("20. Capturing Mobile Dashboard");
  await page.setViewport({ width: 375, height: 812 });
  await page.evaluate(() => { if (window.app) window.app.switchView('dashboard'); });
  await wait(1000);
  await page.screenshot({ path: path.join(outDir, '20_Mobile_Dashboard.png'), fullPage: true });

  // 21. Mobile Workspace
  console.log("21. Capturing Mobile Workspace");
  await page.evaluate(() => { if (window.app) window.app.switchView('workspace'); });
  await wait(1000);
  await page.screenshot({ path: path.join(outDir, '21_Mobile_Workspace.png'), fullPage: true });

  // 22. Mobile Sidebar Open
  console.log("22. Capturing Mobile Sidebar Open");
  try {
      const toggleBtn = await page.$('#btnToggleSidebar');
      if (toggleBtn) await toggleBtn.click();
      await wait(1000);
      await page.screenshot({ path: path.join(outDir, '22_Mobile_Sidebar_Open.png'), fullPage: true });
  } catch(e) { console.log(e); }

  console.log("All 22 screenshots captured successfully in:", outDir);
  await browser.close();
})();
