import formidable from "formidable";
import fs from "fs";
import path from "path";
import { getAuth } from "@clerk/nextjs/server";
import { supabase } from "../../lib/supabase";
import { supabaseAdmin } from "../../lib/supabaseServer";

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { userId } = getAuth(req);

  // Use admin client to bypass RLS (since we use Clerk auth, not Supabase auth)
  const db = supabaseAdmin || supabase;

  try {
    const uploadDir = path.join(process.cwd(), "public", "uploads", "images");

    // Ensure upload directory exists
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const form = formidable({
      uploadDir,
      keepExtensions: true,
      maxFileSize: 20 * 1024 * 1024, // 20MB per image
      maxTotalFileSize: 200 * 1024 * 1024, // 200MB total for up to 50 images
      maxFiles: 50, // Allow up to 50 images
      filter: ({ mimetype }) => {
        // Only allow image files
        return mimetype && mimetype.startsWith("image/");
      },
    });

    const [fields, files] = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        else resolve([fields, files]);
      });
    });

    const file = files.image?.[0] || files.image;
    if (!file) {
      return res.status(400).json({ error: "No image uploaded" });
    }

    const filePath = file.filepath;
    const fileName = file.originalFilename || file.newFilename;
    const fileExt = path.extname(fileName).toLowerCase();

    // Generate a unique filename
    const uniqueName = `${Date.now()}_${fileName}`;
    const newPath = path.join(uploadDir, uniqueName);

    // Move file to new location with unique name
    fs.renameSync(filePath, newPath);

    // Convert to base64 for GPT-4 Vision
    const imageBuffer = fs.readFileSync(newPath);
    const base64Image = imageBuffer.toString("base64");
    const mimeType = file.mimetype || "image/jpeg";

    // Return the public URL and base64 data
    const publicUrl = `/uploads/images/${uniqueName}`;
    const base64Data = `data:${mimeType};base64,${base64Image}`;

    // Get sessionId from form fields if provided
    const sessionId = fields.sessionId?.[0] || fields.sessionId;

    // Save to database if sessionId and userId are provided
    let fileId = null;
    if (sessionId && userId) {
      try {
        const { data: fileData, error: dbError } = await db
          .from('uploaded_files')
          .insert({
            user_id: userId,
            session_id: sessionId,
            name: fileName,
            type: 'image',
            chunks: 1,
            pdf_data: base64Data, // Store base64 for image viewing
          })
          .select()
          .single();

        if (dbError) {
          console.error('Database error saving image:', dbError);
        } else {
          fileId = fileData.id;
          console.log(`📷 Image saved to database: ${fileName} (ID: ${fileId})`);
        }
      } catch (dbErr) {
        console.error('Error saving image to database:', dbErr);
      }
    }

    res.status(200).json({
      success: true,
      url: publicUrl,
      base64: base64Data,
      fileName: fileName,
      size: file.size,
      mimeType,
      fileId, // Return the database ID if saved
    });
  } catch (error) {
    console.error("Image upload error:", error);
    res.status(500).json({ error: error.message || "Failed to upload image" });
  }
}
