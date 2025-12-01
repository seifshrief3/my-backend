// استيراد الحزم
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const multer = require('multer');
// استدعاء مكتبات نظام الملفات (fs)
const fs = require('fs'); // للاستخدام مع createReadStream
const fsp = require('fs/promises'); // للاستخدام مع unlink (الحذف)
const FormData = require('form-data'); // لإرسال الملفات للـ Telegram API

// بيانات البوت والجروب
// **********************************************
const BOT_TOKEN = '8433844275:AAFRpIdSOi5NJs3pyUPVkKmzrq3O8VP118Y';
const CHAT_ID = '-1003383269388';
// **********************************************

const app = express();
const PORT = 3001;

// دالة لعمل Escape لرموز HTML (لمنع أخطاء التنسيق)
const escapeHTML = (text) => {
  if (text === null || text === undefined) return 'N/A';
  // نهرب فقط رموز <, >, و &
  return String(text).replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
};

// --- إعدادات تخزين الملفات باستخدام Multer ---
const upload = multer({ dest: '/backend/uploads' });

// Middleware
const corsOptions = {
  origin: 'http://localhost:5173',
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));


// 🚨 دالة رفع الملف لتيليجرام كرسالة منفصلة
async function uploadToTelegram(filePath, fileName, caption) {
  // 1. إنشاء FormData لإرسال الملف
  const form = new FormData();
  form.append('chat_id', CHAT_ID);
  form.append('document', fs.createReadStream(filePath), { filename: fileName });
  form.append('caption', caption || 'ملف مرفوع'); // استخدام الـ Caption اللي جاي فيه تفاصيل العميل
  form.append('parse_mode', 'HTML');

  const telegramUploadUrl = `https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`;

  try {
    await axios.post(telegramUploadUrl, form, {
      headers: form.getHeaders() // ضروري لـ FormData
    });

    // نرجع نص قابل للضغط كإشعار في رسالة التلخيص
    return `<a href="t.me/${BOT_TOKEN.split(':')[0]}">[اضغط لمشاهدة ${escapeHTML(fileName)}]</a>`;

  } catch (error) {
    console.error(`Error uploading file ${fileName}:`, error.response ? error.response.data : error.message);
    return `[فشل رفع الملف: ${escapeHTML(fileName)}]`;
  }
}
// -------------------------------------------------------------

// 🚀 الـ Endpoint الرئيسي لاستقبال البيانات والملفات
app.post('/api/send-lead', upload.fields([
  { name: 'visaDocument', maxCount: 1 },
  { name: 'passportImage', maxCount: 1 },
  { name: 'RecruitmentForm', maxCount: 1 },
]), async (req, res) => {

  const leadData = req.body;
  const { source } = leadData;
  const files = req.files;

  if (!source) {
    return res.status(400).json({ success: false, message: 'Missing source field.' });
  }

  // قائمة الملفات المؤقتة للحذف
  const tempFilesToDelete = [];

  // دالة مساعدة للحصول على الملف
  const getFileDetails = (fieldName) => {
    const fileArray = files[fieldName];
    return fileArray && fileArray.length > 0 ? fileArray[0] : null;
  };

  // 2. تجهيز رسالة التلخيص الرئيسية والتعامل مع الملفات
  let messageText = `🎉 <b>طلب جديد - ${escapeHTML(source)}</b> 🎉\n\n`;

  if (source === "حجز موعد تساهيل") {
    const { fullName, whatsapp, phone, visaType, center, serviceType } = leadData;

    const clientName = fullName;
    const clientContact = whatsapp || phone;
    const clientCaption = `لعميل: <b>${escapeHTML(clientName)}</b>\nتواصل: ${escapeHTML(clientContact)}`;

    const visaDocFile = getFileDetails('visaDocument');
    const passportImgFile = getFileDetails('passportImage');

    let visaDocLink = 'لم يتم إرفاقه';
    if (visaDocFile) {
      const caption = `📄 مستند التأشيرة\n${clientCaption}`;
      visaDocLink = await uploadToTelegram(visaDocFile.path, visaDocFile.originalname, caption);
      tempFilesToDelete.push(visaDocFile);
    }

    let passportImgLink = 'لم يتم إرفاقه';
    if (passportImgFile) {
      const caption = `🖼️ صورة الجوازات\n${clientCaption}`;
      passportImgLink = await uploadToTelegram(passportImgFile.path, passportImgFile.originalname, caption);
      tempFilesToDelete.push(passportImgFile);
    }

    messageText +=
      `👤 <b>العميل:</b> ${escapeHTML(clientName)}\n` +
      `📞 <b>واتساب:</b> ${escapeHTML(whatsapp)}\n` +
      `☎️ <b>هاتف:</b> ${escapeHTML(phone)}\n` +
      `-------------------- الملفات --------------------\n` +
      `📄 <b>المستند:</b> ${visaDocLink}\n` +
      `🖼️ <b>الجوازات:</b> ${passportImgLink}\n` +
      `👤 <b>اسم العميل:</b> ${escapeHTML(clientName)} | 📞 ${escapeHTML(clientContact)}\n` +
      `-------------------- تفاصيل الموعد --------------------\n` +
      `📅 <b>تاريخ التقديم:</b> ${escapeHTML(leadData.appointmentDate)}\n` +
      `📍 <b>المركز:</b> ${escapeHTML(center)}\n` +
      `🏷️ <b>نوع التأشيرة:</b> ${escapeHTML(visaType)}\n` +
      `⭐ <b>نوع الخدمة:</b> ${escapeHTML(serviceType)}`;


  } else if (source === "نموذج إنجاز") {
    const { clientName, whatsappNumber } = leadData;

    const clientContact = whatsappNumber;
    const clientCaption = `لعميل: <b>${escapeHTML(clientName)}</b>\nتواصل: ${escapeHTML(clientContact)}`;

    const visaDocFile = getFileDetails('visaDocument');
    const passportImgFile = getFileDetails('passportImage');

    let visaDocLink = 'لم يتم إرفاقه';
    if (visaDocFile) {
      const caption = `📄 مستند الإنجاز\n${clientCaption}`;
      visaDocLink = await uploadToTelegram(visaDocFile.path, visaDocFile.originalname, caption);
      tempFilesToDelete.push(visaDocFile);
    }

    let passportImgLink = 'لم يتم إرفاقه';
    if (passportImgFile) {
      const caption = `🖼️ صورة الجوازات\n${clientCaption}`;
      passportImgLink = await uploadToTelegram(passportImgFile.path, passportImgFile.originalname, caption);
      tempFilesToDelete.push(passportImgFile);
    }

    messageText +=
      `👤 <b>العميل:</b> ${escapeHTML(clientName)}\n` +
      `📞 <b>واتساب:</b> ${escapeHTML(whatsappNumber)}\n` +
      `-------------------- مستندات العميل --------------------\n` +
      `📄 <b>مستند الإنجاز:</b> ${visaDocLink}\n` + // تم تغيير الـ Label
      `🖼️ <b>صورة الجوازات:</b> ${passportImgLink}`;

  } else if (source === "نموذج الاستقدام") {
    const { clientName, whatsappNumber, phoneNumber, selectedServices } = leadData;

    const clientContact = whatsappNumber || phoneNumber;
    const clientCaption = `لعميل: <b>${escapeHTML(clientName)}</b>\nتواصل: ${escapeHTML(clientContact)}`;

    const recruitmentDocFile = getFileDetails('RecruitmentForm');
    const passportImgFile = getFileDetails('passportImage');

    let recruitmentDocLink = 'لم يتم إرفاقه';
    if (recruitmentDocFile) {
      const caption = `📄 نموذج الاستقدام\n${clientCaption}`;
      recruitmentDocLink = await uploadToTelegram(recruitmentDocFile.path, recruitmentDocFile.originalname, caption);
      tempFilesToDelete.push(recruitmentDocFile);
    }

    let passportImgLink = 'لم يتم إرفاقه';
    if (passportImgFile) {
      const caption = `🖼️ صورة الجوازات\n${clientCaption}`;
      passportImgLink = await uploadToTelegram(passportImgFile.path, passportImgFile.originalname, caption);
      tempFilesToDelete.push(passportImgFile);
    }

    let servicesList = 'لا يوجد خدمات إضافية';
    if (selectedServices) {
      try {
        servicesList = JSON.parse(selectedServices).map(s => escapeHTML(s)).join(', ');
      } catch (e) {
        servicesList = escapeHTML(selectedServices);
      }
    }

    messageText +=
      `👤 <b>العميل:</b> ${escapeHTML(clientName)}\n` +
      `📞 <b>واتساب:</b> ${escapeHTML(whatsappNumber)}\n` +
      `☎️ <b>هاتف:</b> ${escapeHTML(phoneNumber)}\n` +
      `-------------------- مستندات العميل --------------------\n` +
      `📄 <b>نموذج الاستقدام:</b> ${recruitmentDocLink}\n` + // تم تغيير الـ Label
      `🖼️ <b>صورة الجوازات:</b> ${passportImgLink}\n` +
      `-------------------- الخدمات المطلوبة --------------------\n` +
      `✅ <b>الخدمات:</b> ${servicesList}`;
  }


  // 3. إرسال رسالة التلخيص للتيليجرام
  const telegramUrl = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;

  try {
    await axios.post(telegramUrl, {
      chat_id: CHAT_ID,
      text: messageText,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    });

    console.log(`[${source}] Summary message sent to Telegram.`);

  } catch (error) {
    console.error(`[${source}] Error sending summary to Telegram:`, error.response ? error.response.data : error.message);
  }

  // 4. حذف الملفات المؤقتة بعد الإرسال
  try {
    for (const file of tempFilesToDelete) {
      await fsp.unlink(file.path);
      console.log(`Deleted temp file: ${file.path}`);
    }
  } catch (e) {
    console.error("Error deleting temp files:", e);
  }

  res.json({
    success: true,
    message: `Lead from ${source} processed. Files uploaded to Telegram and temporary copies deleted.`
  });
});

// تشغيل السيرفر
app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});