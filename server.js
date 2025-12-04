// backend/server.js
import express from 'express';
import cors from 'cors';
import axios from 'axios';
import multer from 'multer';
import fs from 'fs';
import fsp from 'fs/promises';
import FormData from 'form-data';

// بيانات البوت والجروب
const BOT_TOKEN = '8433844275:AAFRpIdSOi5NJs3pyUPVkKmzrq3O8VP118Y';
const CHAT_ID = '-1003383269388';

const app = express();
const port = process.env.PORT || 3001;

// دالة لتجنب مشاكل HTML في النصوص
const escapeHTML = (text) => {
  if (text === null || text === undefined) return 'N/A';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
};

// Multer لإدارة الملفات
const upload = multer({ dest: '/backend/uploads' });

// CORS
const corsOptions = {
  origin: ['http://localhost:5173', "https://tasahelvisa.com"],
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// رفع ملف لتلجرام
async function uploadToTelegram(filePath, fileName, caption) {
  const form = new FormData();
  form.append('chat_id', CHAT_ID);
  form.append('document', fs.createReadStream(filePath), { filename: fileName });
  form.append('caption', caption || 'ملف مرفوع');
  form.append('parse_mode', 'HTML');

  const telegramUploadUrl = `https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`;

  try {
    await axios.post(telegramUploadUrl, form, {
      headers: form.getHeaders()
    });
    return `<a href="t.me/${BOT_TOKEN.split(':')[0]}">[اضغط لمشاهدة ${escapeHTML(fileName)}]</a>`;
  } catch (error) {
    console.error(`Error uploading file ${fileName}:`, error.response ? error.response.data : error.message);
    return `[فشل رفع الملف: ${escapeHTML(fileName)}]`;
  }
}

// بناء رسالة نصية نهائية
const buildMessageText = ({ source, leadData, filesLinks, servicesList }) => {
  const escape = escapeHTML;

  if (source === "نموذج الاستقدام") {
    return `🎉 طلب جديد - ${escape(source)} 🎉\n\n` +
      `👤 العميل: ${escape(leadData.clientName)}\n` +
      `📞 واتساب: ${escape(leadData.whatsappNumber)}\n` +
      `☎️ هاتف: ${escape(leadData.phoneNumber)}\n` +
      `-------------------- الخدمات المطلوبة --------------------\n` +
      `✅ الخدمات:\n &bull; ${servicesList}\n` +
      `-------------------- المستندات المرفقة --------------------\n` +
      `📄 نماذج الاستقدام:\n &bull; ${filesLinks.RecruitmentForm.length > 0 ? filesLinks.RecruitmentForm.join('\n &bull; ') : 'لم يتم إرفاق ملفات'}\n` +
      `🖼️ صور الجوازات:\n &bull; ${filesLinks.passportImage.length > 0 ? filesLinks.passportImage.join('\n &bull; ') : 'لم يتم إرفاق صور'}`;
  }

  if (source === "نموذج إنجاز") {
    return `🎉 طلب جديد - ${escape(source)} 🎉\n\n` +
      `👤 العميل: ${escape(leadData.clientName)}\n` +
      `📞 واتساب: ${escape(leadData.whatsappNumber)}\n` +
      `-------------------- المستندات --------------------\n` +
      `📄 مستند الإنجاز:\n &bull; ${filesLinks.RecruitmentForm.length > 0 ? filesLinks.RecruitmentForm.join('\n &bull; ') : 'لم يتم إرفاق ملفات'}\n` +
      `🖼️ صور الجوازات:\n &bull; ${filesLinks.passportImage.length > 0 ? filesLinks.passportImage.join('\n &bull; ') : 'لم يتم إرفاق صور'}`;
  }

  if (source === "حجز موعد تساهيل") {
    return `🎉 طلب جديد - ${escape(source)} 🎉\n\n` +
      `👤 العميل: ${escape(leadData.fullName)}\n` +
      `📞 واتساب: ${escape(leadData.whatsapp)}\n` +
      `☎️ هاتف: ${escape(leadData.phone)}\n` +
      `-------------------- تفاصيل الموعد --------------------\n` +
      `📅 تاريخ التقديم: ${escape(leadData.appointmentDate)}\n` +
      `📍 المركز: ${escape(leadData.center)}\n` +
      `🏷️ نوع التأشيرة: ${escape(leadData.visaType)}\n` +
      `⭐ نوع الخدمة: ${escape(leadData.serviceType)}\n` +
      `-------------------- الملفات --------------------\n` +
      `📄 المستندات:\n &bull; ${filesLinks.RecruitmentForm.length > 0 ? filesLinks.RecruitmentForm.join('\n &bull; ') : 'لم يتم إرفاق مستندات'}\n` +
      `🖼️ الجوازات:\n &bull; ${filesLinks.passportImage.length > 0 ? filesLinks.passportImage.join('\n &bull; ') : 'لم يتم إرفاق صور'}`;
  }

  return 'لا توجد بيانات';
};

// POST endpoint
app.post('/api/send-lead', upload.fields([
  { name: 'visaDocument', maxCount: 100 },
  { name: 'passportImage', maxCount: 100 },
  { name: 'RecruitmentForm', maxCount: 100 },
]), async (req, res) => {
  const leadData = req.body;
  const { source } = leadData;
  const files = req.files;

  if (!source) return res.status(400).json({ success: false, message: 'Missing source field.' });

  const tempFilesToDelete = [];

  const getFileDetails = (fieldName) => {
    const fileArray = files[fieldName];
    return fileArray && Array.isArray(fileArray) ? fileArray : [];
  };

  // رفع الملفات لكل حقل وجمع الروابط
  const filesLinks = {
    RecruitmentForm: [],
    passportImage: [],
    visaDocument: [],
  };

  for (const field of Object.keys(filesLinks)) {
    const fileArray = getFileDetails(field);
    for (const file of fileArray) {
      const caption = `📄 ${field} (${file.originalname})\nلعميل: ${escapeHTML(leadData.clientName || leadData.fullName)}`;
      const link = await uploadToTelegram(file.path, file.originalname, caption);
      filesLinks[field].push(link);
      tempFilesToDelete.push(file);
    }
  }

  // تجهيز servicesList
  let servicesList = 'لا يوجد خدمات إضافية';
  if (leadData.selectedServices) {
    try {
      servicesList = JSON.parse(leadData.selectedServices).map(s => escapeHTML(s)).join('\n &bull; ');
    } catch (e) {
      servicesList = escapeHTML(leadData.selectedServices);
    }
  }

  // بناء رسالة نصية
  const messageText = buildMessageText({ source, leadData, filesLinks, servicesList });

  // إرسال الرسالة النهائية لتلجرام
  try {
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: CHAT_ID,
      text: messageText,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    });
    console.log(`[${source}] Summary message sent to Telegram.`);
  } catch (error) {
    console.error(`[${source}] Error sending summary to Telegram:`, error.response ? error.response.data : error.message);
  }

  // حذف الملفات المؤقتة
  try {
    for (const file of tempFilesToDelete) {
      await fsp.unlink(file.path);
      console.log(`Deleted temp file: ${file.path}`);
    }
  } catch (e) {
    console.error("Error deleting temp files:", e);
  }

  res.json({ success: true, message: `Lead from ${source} processed. Files uploaded to Telegram.` });
});

app.listen(port, () => {
  console.log(`Backend server running on port ${port}`);
});
