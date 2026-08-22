const express = require('express');
const cors = require('cors');
const fs = require('fs/promises');
const path = require('path');

const app = express();
const PORT = 5000;
const DATA_DIR = path.join(__dirname, 'data');

app.use(cors());
app.use(express.json());

// Global Request Logger to capture all raw C agent interactions
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`\n>>> [${timestamp}] Incoming Request: ${req.method} ${req.originalUrl}`);
  }
  next();
});

// File paths
const WHITELIST_FILE = path.join(DATA_DIR, 'whitelist.json');
const STUDENTS_FILE = path.join(DATA_DIR, 'students.json');
const COPYLIMIT_FILE = path.join(DATA_DIR, 'copylimit.json');

// Default initial data
const defaults = {
  whitelist: [
    { id: 1, url: 'stackoverflow.com', category: 'Documentation' },
    { id: 2, url: 'github.com', category: 'Repository' },
    { id: 3, url: 'docs.python.org', category: 'Reference' }
  ],
  students: [
    { pcId: 'PC-01', studentId: '2024-1-60-012', name: 'Alex Johnson', activeApp: 'VS Code', status: 'Allowed', lastActive: 'Just now' },
    { pcId: 'PC-05', studentId: '2024-1-60-108', name: 'Nicho Perez', activeApp: 'Spotify', status: 'Flagged', lastActive: '3m ago' }
  ],
  copylimit: { copyLimit: 150 }
};

// Ensure data folder and JSON files exist on boot
async function initStorage() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    
    const initFile = async (filePath, initialData) => {
      try {
        await fs.access(filePath);
      } catch {
        await fs.writeFile(filePath, JSON.stringify(initialData, null, 2));
      }
    };

    await initFile(WHITELIST_FILE, defaults.whitelist);
    await initFile(STUDENTS_FILE, defaults.students);
    await initFile(COPYLIMIT_FILE, defaults.copylimit);
  } catch (err) {
    console.error('Error initializing file storage:', err);
  }
}

// Helper functions to read/write JSON files
async function readData(filePath) {
  const content = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(content);
}

async function writeData(filePath, data) {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

// ---------------- API ENDPOINTS ---------------- //

// --- Whitelist Routes ---
app.get('/api/whitelist', async (req, res) => {
  try {
    const data = await readData(WHITELIST_FILE);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read whitelist data' });
  }
});

app.post('/api/whitelist', async (req, res) => {
  try {
    const { url, category } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });

    const currentList = await readData(WHITELIST_FILE);
    const newEntry = {
      id: Date.now(),
      url: url.replace(/^(https?:\/\/)?(www\.)?/, ''),
      category: category || 'General'
    };

    currentList.push(newEntry);
    await writeData(WHITELIST_FILE, currentList);
    res.status(201).json(newEntry);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save domain' });
  }
});

app.delete('/api/whitelist/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const currentList = await readData(WHITELIST_FILE);
    const filteredList = currentList.filter(item => item.id !== id);

    await writeData(WHITELIST_FILE, filteredList);
    res.json({ message: 'Domain removed successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete domain' });
  }
});

// --- Student App Monitoring Routes ---
app.get('/api/students', async (req, res) => {
  try {
    const data = await readData(STUDENTS_FILE);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read student data' });
  }
});

// Endpoint for lab PCs / agent apps to ping current foreground app status
app.post('/api/students/ping', async (req, res) => {
  try {
    // Print complete payload received from C program
    console.log('----------------------------------------------------');
    console.log('  [C AGENT DATA RECEIVED]');
    console.log('  PC ID      :', req.body.pcId);
    console.log('  Student ID :', req.body.studentId);
    console.log('  Name       :', req.body.name);
    console.log('  Active App :', req.body.activeApp);
    console.log('  Status     :', req.body.status);
    console.log('  Raw Body   :', JSON.stringify(req.body));
    console.log('----------------------------------------------------');

    const { pcId, studentId, name, activeApp, status } = req.body;
    const students = await readData(STUDENTS_FILE);

    const existingIndex = students.findIndex(s => s.pcId === pcId);
    const updatedStudent = {
      pcId,
      studentId: studentId || (existingIndex >= 0 ? students[existingIndex].studentId : 'N/A'),
      name: name || (existingIndex >= 0 ? students[existingIndex].name : 'Unknown PC'),
      activeApp: activeApp || 'Desktop',
      status: status || 'Allowed',
      lastActive: 'Just now'
    };

    if (existingIndex >= 0) {
      students[existingIndex] = updatedStudent;
    } else {
      students.push(updatedStudent);
    }

    await writeData(STUDENTS_FILE, students);
    res.json({ message: 'Status updated', student: updatedStudent });
  } catch (err) {
    console.error('Error processing telemetry ping:', err);
    res.status(500).json({ error: 'Failed to update student state' });
  }
});

// --- Copy Limit Policy Routes ---
app.get('/api/copylimit', async (req, res) => {
  try {
    const data = await readData(COPYLIMIT_FILE);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read copy limit policy' });
  }
});

app.post('/api/copylimit', async (req, res) => {
  try {
    const { copyLimit } = req.body;
    if (typeof copyLimit !== 'number') {
      return res.status(400).json({ error: 'Valid numerical limit is required' });
    }

    const payload = { copyLimit };
    await writeData(COPYLIMIT_FILE, payload);
    res.json({ message: 'Copy limit updated successfully', policy: payload });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save copy limit' });
  }
});

// --- Consolidated Agent Configuration Route ---
app.get('/api/agent/config', async (req, res) => {
  try {
    const whitelist = await readData(WHITELIST_FILE);
    const copylimit = await readData(COPYLIMIT_FILE);
    
    console.log('  [C AGENT FETCHED CONFIG]');
    
    res.json({
      copyLimit: copylimit.copyLimit,
      whitelist: whitelist.map(item => item.url)
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate agent configuration' });
  }
});

// Start Server
initStorage().then(() => {
  app.listen(PORT, () => {
    console.log(`LabGuard Server running on http://localhost:${PORT}`);
  });
});