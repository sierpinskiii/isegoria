const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Configuration, OpenAIApi } = require('openai');
require('dotenv').config();

const app = express();
const port = 3000;

app.use(bodyParser.json());
app.use(cors());
app.use(express.static('public'));

// OpenAI API key setup
const configuration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

let opinions = [];

async function getAverageOpinion(opinions) {
    const prompt = `Based on the following opinions, please summarize the average opinion of this group:\n\n${opinions.join("\n")}`;
    const response = await openai.createCompletion({
        model: "text-davinci-003",
        prompt: prompt,
        max_tokens: 150,
    });
    return response.data.choices[0].text.trim();
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
