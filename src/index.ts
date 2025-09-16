import express from "express";
import fs from "fs";
import dotenv from "dotenv";
import Groq from "groq-sdk";
import bodyParser from "body-parser";
import cors from "cors";


import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { DynamoDBClient, PutItemCommand, ScanCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { StreamingBlobPayloadOutputTypes } from "@smithy/types";

const envFile = `.env.${process.env.NODE_ENV || "dev"}`;
dotenv.config({ path: envFile });

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors());

// app.use(express.urlencoded({ extended: true }));

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY, // 👈 here
});

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "",
    sessionToken: process.env.AWS_SESSION_TOKEN,
  },
});
const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || "us-east-1",
});

 function safeString(val: any) {
   if (val === undefined || val === null) return "";
   return typeof val === "string" ? val : String(val);
 }

function parseWrappedJson(str:string) {
  
  try {
    // 1. Remove markdown fences
    let cleaned = str
      .replace(/^```json/i, "")
      .replace(/```$/i, "")
      .trim();

    // 2. Fix invalid multiline strings inside JSON
    // Replace raw newlines inside quotes with \n
    cleaned = cleaned.replace(
      /:\s*"\s*([\s\S]*?)"\s*([,}])/g,
      (match, p1, p2) => {
        const fixed = p1.replace(/\n\s*/g, "\\n"); // escape newlines
        return `: "${fixed}"${p2}`;
      }
    );


    // 3. Parse JSON safely
    return JSON.parse(cleaned);

  } catch (err:any) {
    console.error("Failed to parse JSON:", err.message);
    return null;
  }
}


app.get("/get-presigned-url", async (req, res) => {
  try {
    // const { storeId } = req.body;
    const storeId = req.query.storeId;
    const randomNum = Math.floor(Math.random() * 1000000);
    // fileKey should be the path of the folder and a unique file name
    const audioFileKey = `${storeId}/${randomNum}/audio/audio.mp3`; // e.g., uploads/storeId/123456
    const videoFileKey = `${storeId}/${randomNum}/video/video.mp4`; // e.g., uploads/storeId/123456

    const command = new PutObjectCommand({
      Bucket: "epos-support-agent",
      Key: audioFileKey,
      // ContentType is optional for multi-file support; let client specify or omit for generic uploads
    });
    const videoCommand = new PutObjectCommand({
      Bucket: "epos-support-agent",
      Key: videoFileKey,
      // ContentType is optional for multi-file support; let client specify or omit for generic uploads
    });

    const audiopresignedURL = await getSignedUrl(s3Client, command, {
      expiresIn: 3600,
    }); // 1 hour
    const videoPresignedURL = await getSignedUrl(s3Client, videoCommand, {
      expiresIn: 3600,
    }); // 1 hour

    return res.json({
      success: true,
      storeId,
      ticketId:randomNum,
      audiopresignedURL,
      videoPresignedURL,
    });
  } catch (err) {
    console.error("Error generating presigned URL:", err);
    res
      .status(500)
      .json({ success: false, message: "Failed to generate presigned URL" });
  }
});

// const response = await client.audio.transcriptions.create({
//   file: fileStream,
//   model: "whisper-1", // OpenAI's speech-to-text model
// });

// 🎤 Step 1: Upload & transcribe audio
app.post("/transcribe", async (req, res) => {
  try {
    // console.log("🎤 Transcribe request received", req);
    const { ticketId, storeId } = req.body;

    if (!ticketId) {
      return res.status(400).json({ error: "No ticketId Exists." });
    }

    // Generate a getObjectCommand to get the audio file from the S3 bucket
    // const getObjectCommand = new GetObjectCommand({
    //   Bucket: "epos-support-agent",
    //   Key: `${storeId}/${ticketId}/audio/audio.mp3`,
    // });
    const getObjectVideoCommand = new GetObjectCommand({
      Bucket: "epos-support-agent",
      Key: `${storeId}/${ticketId}/video/video.mp4`,
    });

    // const audiogetpresignedURL = await getSignedUrl(
    //   s3Client,
    //   getObjectCommand,
    //   {
    //     expiresIn: 3600,
    //   }
    // );
    const videogetpresignedURL = await getSignedUrl(
      s3Client,
      getObjectVideoCommand,
      {
        expiresIn: 3600,
      }
    );

    const command = new GetObjectCommand({
      Bucket: "epos-support-agent",
      Key: `${storeId}/${ticketId}/video/video.mp4`,
    });

    const response = await s3Client.send(command);

    if (!response?.Body) {
      return res
        .status(400)
        .json({ error: "No valid response. Body might be empty." });
    }

    const videoBuffer = Buffer.from(
      (await response.Body.transformToByteArray()).buffer
    );

    //console.log("🎤 Audio buffer", audioBuffer);

    fs.writeFileSync(`/tmp/${storeId}_${ticketId}_video.mp4`, videoBuffer);
    // Read Audio File From S3 Bucket By Using Ticket Id and Store Id

    // fs.writeFileSync(tempFilePath, Buffer.from(audioBuffer));

    const transcription = await groq.audio.transcriptions.create({
      file: fs.createReadStream(`/tmp/${storeId}_${ticketId}_video.mp4`),
      model: "whisper-large-v3-turbo",
      response_format: "verbose_json",
    });
  
    if (!transcription.text || transcription.text.trim().length === 0) {
      return res
        .status(400)
        .json({ error: "No valid transcription. Audio might be empty." });
    }
    const jiraPrompt = `
    You are an assistant that creates **professional JIRA tickets**.

    Take the following issue report (transcription from audio):

    "${transcription.text}"

    Generate:
    1. **Header** → A short, clear title (max 10 words).
    2. **Description** → Well-structured with:
       - ✅ Summary section
       - 🔎 Steps to Reproduce (numbered list)
       - ⚠️ Impact
       - 🛠️ Suggested Fix / Next Steps
       - Use **bold** for key terms
       - Add emojis/icons where helpful for readability

    Return output strictly in **HTML TEMPLATE AS JSON** with fields: header, description.
    `;

    try {

      const responseAI = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile", // Best for detailed structured text
        messages: [
          {
            role: "system",
            content:
              "Convert the transcription JSON into a clean HTML template with sections for Full Text and Segments.",
          },
          {
            role: "user",
            content: JSON.stringify(jiraPrompt),
          },
        ],
        temperature: 0.3,
      });

      const aiOutput = responseAI.choices[0].message.content;
      console.log("AI OUTPUT", aiOutput);
      //const parsed = parseWrappedJson(aiOutput ?? "");
      const parsed = parseWrappedJson(aiOutput ?? "");
      return res.json({
        success: true,
        storeId,
        ticketId,
        videogetpresignedURL,
        jiraContent: parsed,
      });
    } catch (error) {
      console.log("Content Conversion Error====>", error);
      const { status, message }: any = error;
      if (status === 400) {
        return res.status(400).json({ error: message });
      } else {
        
        res.status(500).json({ error: "Something went wrong" });
      }
    }

    //console.log(transcription.text);

    // cleanup uploaded file
    //fs.unlinkSync(req.file.path);

    //res.json({ text: transcription.text });
  } catch (errors) {
     console.log("Audio Transcription Error====>", errors);
     const { status, error }: any = errors;
     if (status === 400) {
       return res.status(400).json(error);
     } else {
       res.status(500).json({ error: "Something went wrong" });
     }
  }
});



app.post("/createTicket", express.json(), async (req, res) => {
  try {
    const {
      deviceInfo = {},
      summary,
      description,
      videogetpresignedURL,
      audiogetpresignedURL,
      ticketId,
      storeId,
      id, // Accept id if provided
    } = req.body;

    // Ensure all required fields are present
    if (!ticketId || !storeId || !summary || !description) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Ensure id is present and is a string (DynamoDB error: Missing the key id in the item)
    // If not provided, use ticketId as id
    const itemId = (typeof id === "string" && id) ? id : String(ticketId);

    // Defensive: Ensure all string fields are strings (DynamoDB error: NUMBER_VALUE cannot be converted to String)

    const params = {
      TableName: "epos-support-agent",
      Item: {
        PK: { S: safeString(storeId) },
        id: { S: safeString(itemId) }, // Keep id as your table requires it
        deviceInfo: { S: JSON.stringify(deviceInfo) },
        ticketId: { S: safeString(ticketId) },
        summary: { S: safeString(summary) },
        description: { S: safeString(description) },
        videoLink: videogetpresignedURL ? { S: safeString(videogetpresignedURL) } : { NULL: true },
        audioLink: audiogetpresignedURL ? { S: safeString(audiogetpresignedURL) } : { NULL: true },
        createdAt: { S: new Date().toISOString() },
        status: { S: "Under Review" },
      },
    };

    await dynamoClient.send(new PutItemCommand(params));

    res.json({ success: true, message: "Ticket created successfully", ticketId, storeId });
  } catch (error) {
    console.error("DynamoDB error:", error);
    res.status(500).json({ error: "Failed to create ticket" });
  }
});

app.get("/listTickets", async (req, res) => {
  try {
    // Accept storeId from query or body for flexibility
    const { storeId } = req.query || req.body;
   

    // Use Scan with filter since we need all tickets for a storeId
    // but table requires both PK and id (sort key)
    const params: any = {
      TableName: "epos-support-agent",
    };
    
    if (storeId) {
      params.FilterExpression = "PK = :storeId";
      params.ExpressionAttributeValues = {
        ":storeId": { S: safeString(storeId) },
      };
    }

    const result =  await dynamoClient.send(new ScanCommand(params))
    
    // Map DynamoDB items to plain JS objects for easier consumption
    const tickets = result.Items?.map(item => ({
      storeId: item.PK?.S,
      ticketId: item.id?.S || item.ticketId?.S,
      summary: item.summary?.S,
      description: item.description?.S,
      audioLink: item.audioLink?.S,
      videoLink: item.videoLink?.S,
      createdAt: item.createdAt?.S,
      deviceInfo: item.deviceInfo?.S ? JSON.parse(item.deviceInfo.S) : null,
      status: item.status?.S,
    })).filter(ticket => storeId ? ticket.storeId === storeId : true)

    res.json({ success: true, tickets, count: tickets?.length || 0 });
  } catch (error: any) {
    console.error("DynamoDB error:", error);
    res.status(500).json({ error: "Failed to list tickets" });
  }
});

app.post("/updateTicket", async (req, res) => {
    try {
      const { ticketId, status } = req.body;
      if (!ticketId || !status) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      const newStatus = status;
      const params = {
        TableName: "epos-support-agent",
        Key: {
          id: { S: safeString(ticketId) },
        },
        UpdateExpression: "SET #status = :newStatus",
        ExpressionAttributeNames: {
          "#status": "status",
        },
        ExpressionAttributeValues: {
          ":newStatus": { S: newStatus },
        },
      };
      await dynamoClient.send(new UpdateItemCommand(params));
      res.json({
        success: true,
        message: "Ticket updated successfully",
        ticketId,
        newStatus,
      });
    } catch (error) {
          console.error("DynamoDB error:", error);
      res.status(500).json({ error: "Failed to update ticket" });
    }
});





app.listen(process.env.PORT, () => {
  console.log(`Server running on http://localhost:${process.env.PORT}`);
});
function streamPipeline(Body: StreamingBlobPayloadOutputTypes | undefined, arg1: fs.WriteStream) {
  throw new Error("Function not implemented.");
}

