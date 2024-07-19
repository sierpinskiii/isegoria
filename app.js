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
const deadline = new Date('2023-07-30T23:59:00'); // 提出期限の設定

// OpenAI API key setup
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

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

app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});
