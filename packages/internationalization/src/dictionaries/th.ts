import type { Dictionary } from "./en";

export const th: Dictionary = {
  brand: {
    name: "THAI passport",
    tagline: "ศูนย์ควบคุมสำหรับ THAIpass Gateway",
    titleTemplate: "%s ✦ AI Passport",
  },
  commandMenu: {
    empty: "ไม่พบผลลัพธ์",
    groups: {
      gateway: "เกตเวย์",
      navigation: "การนำทาง",
      theme: "ธีม",
    },
    placeholder: "พิมพ์คำสั่งหรือค้นหา...",
  },
  common: {
    actions: {
      cancel: "ยกเลิก",
      clear: "ล้างค่า",
      close: "ปิด",
      copied: "คัดลอกแล้ว",
      copy: "คัดลอก",
      refresh: "รีเฟรช",
      refreshing: "กำลังรีเฟรช...",
      save: "บันทึก",
      submit: "ส่งข้อมูล",
    },
    languages: {
      en: "English",
      label: "ภาษา",
      th: "ภาษาไทย",
    },
    loading: "กำลังโหลด...",
    status: {
      connected: "เชื่อมต่อแล้ว",
      disconnected: "ไม่ได้เชื่อมต่อ",
      error: "ข้อผิดพลาด",
      healthy: "พร้อมใช้งาน",
      offline: "ออฟไลน์",
      online: "ออนไลน์",
      unknown: "ไม่ทราบสถานะ",
    },
    theme: {
      dark: "มืด",
      label: "ธีม",
      light: "สว่าง",
      system: "ตามระบบ",
    },
  },
  integrations: {
    description: "การกำหนดค่าสำเร็จรูปสำหรับ Claude Code, Cursor, AI SDKs และ cURL",
    title: "การเชื่อมต่อ",
  },
  learning: {
    description: "EXP ที่ LMS บันทึกไว้และรอบการรันที่ช่วยสะสม EXP",
    title: "การเรียนรู้",
  },
  models: {
    description: "โมเดลทั้งหมดที่เซสชัน AI Pass ปัจจุบันของคุณสามารถเข้าถึงได้",
    searchPlaceholder: "ค้นหาโมเดล...",
    title: "โมเดล",
  },
  navigation: {
    apiReference: "เอกสาร API",
    github: "GitHub",
    items: {
      integrations: {
        description: "การตั้งค่าสำเร็จรูปสำหรับ Claude Code, Cursor, SDKs และ cURL",
        title: "การเชื่อมต่อ",
      },
      learning: {
        description: "EXP ที่ LMS บันทึกไว้ และประวัติรอบการทำงาน",
        title: "การเรียนรู้",
      },
      models: {
        description: "โมเดลทั้งหมดที่เซสชันของคุณเข้าถึงได้",
        title: "โมเดล",
      },
      overview: {
        description: "สถานะเกตเวย์ โควตาคงเหลือ และแค็ตตาล็อกโมเดล",
        title: "ภาพรวม",
      },
      playground: {
        description: "ทดสอบสตรีมพรอมต์ผ่านพร็อกซีและจับเวลาการตอบสนอง",
        title: "เพลย์กราวด์",
      },
      settings: {
        description: "URL ของพร็อกซี, เซสชันคุกกี้ และธีมการแสดงผล",
        title: "การตั้งค่า",
      },
    },
    search: "ค้นหา",
    sections: {
      configure: "การกำหนดค่า",
      gateway: "เกตเวย์",
    },
    skipToContent: "ข้ามไปยังเนื้อหา",
  },
  overview: {
    balanceError: "ไม่สามารถอ่านยอดยอดคงเหลือได้",
    cards: {
      catalog: "แค็ตตาล็อกโมเดล",
      gateway: "สถานะเกตเวย์",
    },
    description:
      "สถานะการทำงานของเกตเวย์ในเครื่อง ยอดคงเหลือที่ใช้ได้ และโมเดลที่เข้าถึงได้",
    sessionGate: {
      action: "ไปที่การตั้งค่า",
      description:
        "เชื่อมต่อ AI Pass เซสชันคุกกี้ของคุณในการตั้งค่าเพื่อดูยอดคงเหลือ แค็ตตาล็อกโมเดล และเริ่มใช้งาน",
      title: "ไม่พบเซสชันคุกกี้",
    },
    stats: {
      catalog: "โมเดลที่พร้อมใช้งาน",
      credits: "เครดิตคงเหลือ",
      health: "สถานะเกตเวย์",
    },
    title: "ภาพรวม",
  },
  playground: {
    description: "สตรีมข้อความพรอมต์ผ่านพร็อกซีและวัดความหน่วง (latency) ของการตอบกลับ",
    title: "เพลย์กราวด์",
  },
  settings: {
    appearance: {
      description: "ระบบจะปรับตามการตั้งค่าธีมของระบบปฏิบัติการของคุณ",
      title: "การแสดงผล",
    },
    description:
      "ข้อมูลทั้งหมดจะถูกเก็บไว้เฉพาะในเบราว์เซอร์นี้ เกตเวย์ไม่มีการจัดเก็บข้อมูลประจำตัวใดๆ",
    language: {
      description: "เลือกภาษาสำหรับแสดงผลบนอินเทอร์เฟซ",
      title: "ภาษา",
    },
    proxy: {
      description: "ที่อยู่ URL ของเกตเวย์พร็อกซีที่กำลังทำงานอยู่",
      title: "URL ของพร็อกซี",
    },
    session: {
      description: "เซสชันคุกกี้สำหรับเชื่อมต่อไปยัง AI Pass เก็บไว้เฉพาะในเบราว์เซอร์เท่านั้น",
      title: "เซสชันคุกกี้",
    },
    title: "การตั้งค่า",
  },
};
