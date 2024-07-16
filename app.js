const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const OpenAI = require('openai');
require('dotenv').config();

const app = express();
const port = 3000;

app.use(bodyParser.json());
app.use(cors());
app.use(express.static('public'));

// OpenAI API key setup
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

let opinions = [];

async function getAverageOpinion(opinions) {
    const prompt = `Based on the following opinions, please summarize the average opinion of this group:\n\n${opinions.join("\n")}`;
    console.log("Generated Prompt: ", prompt);
    try {
        const response = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [{ role: "user", content: prompt }],
            max_tokens: 150,
        });
        console.log("OpenAI Response: ", response); // 追加: レスポンス全体をログに出力
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

app.post('/api/opinions', async (req, res) => {
    const opinion = req.body.opinion;
    opinions.push(opinion);

    try {
        const averageOpinion = await getAverageOpinion(opinions);
        res.json({ averageOpinion });
    } catch (error) {
        console.error('Error occurred:', error.response ? error.response.data : error.message);
        res.status(500).send(`Error occurred: ${error.response ? error.response.data : error.message}`);
    }
});

app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});
