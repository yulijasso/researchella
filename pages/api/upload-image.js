import formidable from "formidable";
import fs from "fs";
import path from "path";

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

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

    res.status(200).json({
      success: true,
      url: publicUrl,
      base64: `data:${mimeType};base64,${base64Image}`,
      fileName: fileName,
      size: file.size,
      mimeType,
    });
  } catch (error) {
    console.error("Image upload error:", error);
    res.status(500).json({ error: error.message || "Failed to upload image" });
  }
}
