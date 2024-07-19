const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const OpenAI = require('openai');
const fs = require('fs-extra');
require('dotenv').config();

const app = express();
const port = 3000;

app.use(bodyParser.json());
app.use(cors());
app.use(express.static('public'));

const opinionsFilePath = './opinions.json';
const configFilePath = './config.json'; // 設定ファイルのパス
const classesFilePath = './classes.json'; // 授業リストのパス

// OpenAI API key setup
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// Function to load configuration
async function loadConfig() {
    try {
        const data = await fs.readFile(configFilePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error loading config:', error);
        throw error;
    }
}

// Function to load classes from file
async function loadClasses() {
    try {
        const data = await fs.readFile(classesFilePath, 'utf8');
        return JSON.parse(data).classes;
    } catch (error) {
        console.error('Error loading classes:', error);
        throw error;
    }
}

// Function to load opinions from file
async function loadOpinions() {
    try {
        const data = await fs.readFile(opinionsFilePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            return []; // File doesn't exist yet
        } else {
            throw error;
        }
    }
}

// Function to save opinions to file
async function saveOpinions(opinions) {
    await fs.writeFile(opinionsFilePath, JSON.stringify(opinions, null, 2));
}

// Function to get average opinion
async function getAverageOpinion(opinions) {
    const prompt = `Based on the following opinions, please summarize the average opinion of this group:\n\n${opinions.join("\n")}`;
    console.log("Generated Prompt: ", prompt);
    try {
        const response = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [{ role: "user", content: prompt }],
            max_tokens: 150,
        });
        console.log("OpenAI Response: ", response);
        if (response && response.choices && response.choices.length > 0) {
            return response.choices[0].message.content.trim();
        } else {
            throw new Error("No choices found in OpenAI response");
        }
    } catch (error) {
        console.error("OpenAI API Error: ", error);
        throw error;
    }
}

// Middleware to load config
let deadline;
app.use(async (req, res, next) => {
    try {
        const config = await loadConfig();
        deadline = new Date(config.deadline);
        next();
    } catch (error) {
        next(error);
    }
});

// Endpoint to receive opinions
app.post('/api/opinions', async (req, res) => {
    const opinion = req.body.opinion;
    const now = new Date();

    if (now > deadline) {
        return res.status(403).json({ message: "The submission period has ended." });
    }

    let opinions = await loadOpinions();
    opinions.push(opinion);
    await saveOpinions(opinions);
    res.json({ message: "Opinion received" });
});

// Endpoint to get the deadline
app.get('/api/deadline', (req, res) => {
    res.json({ deadline: deadline.toISOString() });
});

// Endpoint to get the classes
app.get('/api/classes', async (req, res) => {
    try {
        const classes = await loadClasses();
        res.json({ classes });
    } catch (error) {
        res.status(500).json({ message: 'Error loading classes' });
    }
});

app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});
