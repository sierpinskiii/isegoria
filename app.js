const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const OpenAI = require('openai');
const fs = require('fs-extra');
const { Fido2Lib } = require('fido2-lib');
require('dotenv').config();

const app = express();
const port = 3000;

app.use(bodyParser.json());
app.use(cors());
app.use(express.static('public'));

const opinionsFilePath = './opinions.json';
const configFilePath = './config.json'; // 設定ファイルのパス
const classesFilePath = './classes.json'; // 授業リストのパス

// FIDO2 Library setup
const fido2 = new Fido2Lib({
    timeout: 60000,
    rpId: "localhost",
    rpName: "Example App",
    rpIcon: "https://example.com/icon.png",
    challengeSize: 32,
    attestation: "none",
    authenticatorRequireResidentKey: false,
    authenticatorUserVerification: "preferred",
});

// In-memory user database
const users = new Map();

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

// FIDO2 Registration
app.post('/api/registerRequest', async (req, res) => {
    const userId = req.body.userId;
    const user = {
        id: Buffer.from(userId).toString("base64"), // Convert userId to Buffer
        name: userId,
        displayName: userId
    };
    const challengeMakeCred = await fido2.attestationOptions();

    // Set the user for this request
    challengeMakeCred.user = user;
    challengeMakeCred.challenge = Buffer.from(challengeMakeCred.challenge).toString('base64'); // Base64 encode the challenge
    users.set(userId, { ...user, challenge: challengeMakeCred.challenge });

    res.json(challengeMakeCred);
});

function base64ToArrayBuffer(base64) {
    var binaryString = atob(base64);
    var bytes = new Uint8Array(binaryString.length);
    for (var i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
}

app.post('/api/registerResponse', async (req, res) => {
    const userId = req.body.userId;
    const attestationObject = req.body.attestationObject;
    const clientDataJSON = req.body.clientDataJSON;
    const rawId = req.body.rawId;
    const challenge = users.get(userId).challenge;

    const attestationExpectations = {
        challenge: challenge,
        origin: "http://localhost:3000",
        factor: "either"
    };

    try {
        // Ensure attestationObject and clientDataJSON are base64 strings
        if (typeof attestationObject !== 'string' || typeof clientDataJSON !== 'string') {
            throw new TypeError('attestationObject and clientDataJSON must be base64 encoded strings');
        }

        const authnResponse = {
            id: base64ToArrayBuffer(rawId),
            rawId: base64ToArrayBuffer(rawId),
            response: {
                attestationObject: attestationObject,
                clientDataJSON: clientDataJSON
            }
        };
        const regResult = await fido2.attestationResult(authnResponse, attestationExpectations);

        users.set(userId, { ...users.get(userId), credentials: regResult.authnrData });

        res.json({ success: true });
    } catch (error) {
        console.error("FIDO2 Attestation Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// FIDO2 Authentication
app.post('/api/loginRequest', async (req, res) => {
    const userId = req.body.userId;
    const user = users.get(userId);
    if (!user) {
        return res.status(404).json({ message: "User not found" });
    }

    const challenge = await fido2.assertionOptions();
    challenge.allowCredentials = [{
        type: "public-key",
        id: Buffer.from(user.credentials.get("credId")).toString("base64")
    }];
    challenge.challenge = Buffer.from(challenge.challenge).toString('base64'); // Base64 encode the challenge

    user.challenge = challenge.challenge;
    users.set(userId, user);

    res.json(challenge);
});

app.post('/api/loginResponse', async (req, res) => {
    const userId = req.body.userId;
    const authenticatorData = req.body.authenticatorData;
    const clientDataJSON = req.body.clientDataJSON;
    const signature = req.body.signature;
    const rawId = req.body.rawId; // Directly use Buffer for rawId
    const challenge = users.get(userId).challenge;
    const user = users.get(userId);

    const assertionExpectations = {
        challenge: challenge,
        origin: "http://localhost:3000",
        factor: "either",
        publicKey: user.credentials.get("credentialPublicKeyPem"),
        prevCounter: 0,
        userHandle: Buffer.from(userId).toString("base64"),
    };

    try {
        const authResult = await fido2.assertionResult({
            id: base64ToArrayBuffer(rawId),
            rawId: base64ToArrayBuffer(rawId),
            response: {
                authenticatorData: base64ToArrayBuffer(authenticatorData),
                clientDataJSON: base64ToArrayBuffer(clientDataJSON),
                signature: base64ToArrayBuffer(signature),
                userHandle: base64ToArrayBuffer(Buffer.from(userId).toString("base64")),
            }
        }, assertionExpectations);

        res.json({ success: true });
    } catch (error) {
        console.error("FIDO2 Assertion Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});
app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});