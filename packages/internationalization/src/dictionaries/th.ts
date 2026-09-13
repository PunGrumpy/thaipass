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
    placeholder: "พิมพ์คำสั่งหรือค้นหา…",
  },
  common: {
    actions: {
      cancel: "ยกเลิก",
      clear: "ล้างค่า",
      close: "ปิด",
      copied: "คัดลอกแล้ว",
      copy: "คัดลอก",
      refresh: "รีเฟรช",
      refreshing: "กำลังรีเฟรช…",
      save: "บันทึก",
      submit: "ส่งข้อมูล",
    },
    gatewayStatus: "สถานะเกตเวย์: %s",
    languages: {
      en: "English",
      label: "ภาษา",
      th: "ภาษาไทย",
    },
    loading: "กำลังโหลด…",
    status: {
      checking: "กำลังตรวจสอบ…",
      connected: "เชื่อมต่อแล้ว",
      disconnected: "ไม่ได้เชื่อมต่อ",
      error: "ข้อผิดพลาด",
      healthy: "พร้อมใช้งาน",
      offline: "ออฟไลน์",
      online: "ออนไลน์",
      unknown: "ไม่ทราบสถานะ",
      unreachable: "เชื่อมต่อไม่ได้",
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
    sidebar: "แถบนำทาง",
    sidebarDescription: "แถบนำทางของแดชบอร์ด",
    skipToContent: "ข้ามไปยังเนื้อหา",
    toggleSidebar: "เปิดหรือปิดแถบนำทาง",
  },
  overview: {
    balanceError: "ไม่สามารถอ่านยอดยอดคงเหลือได้",
    balanceErrorHint: "ตรวจสอบว่าเกตเวย์เข้าถึงได้และเซสชันคุกกี้ยังไม่หมดอายุ แล้วกดรีเฟรช",
    catalog: {
      action: "ดูโมเดลทั้งหมด",
      description: "%s โมเดล ครอบคลุมปลายทางแบบแชทและสื่อ",
      priced: "มีราคา %s จาก %s",
      pricedLabel: "ราคาตามตลาด",
      title: "สัดส่วนแค็ตตาล็อก",
    },
    description:
      "สถานะการทำงานของเกตเวย์ในเครื่อง ยอดคงเหลือที่ใช้ได้ และโมเดลที่เข้าถึงได้",
    gateway: {
      actionLabel: "เปิดเอกสาร API",
      costLive: "OpenRouter (สด)",
      costOff: "ปิดใช้งาน",
      offline: "กำลังรอการตอบกลับจากเกตเวย์",
      online: "เชื่อมต่อได้และกำลังส่งต่อไปยัง AI Pass",
      rows: {
        cost: "การประเมินค่าใช้จ่าย",
        models: "โมเดลแชทในตัว",
        origin: "ต้นทางของพร็อกซี",
        upstream: "อัปสตรีม",
      },
      title: "เกตเวย์",
    },
    sessionGate: {
      action: "เพิ่มเซสชันคุกกี้",
      badge: "ยังไม่ได้เชื่อมต่อเซสชัน",
      description:
        "เกตเวย์จะส่งต่อข้อมูลประจำตัว AI Pass ของคุณเองและไม่เก็บอะไรไว้ เพิ่มเซสชันคุกกี้เพียงครั้งเดียวเพื่อเปิดใช้โควตา แค็ตตาล็อก และเพลย์กราวด์",
      step: "ขั้นที่ %s จาก %s",
      steps: {
        copy: {
          body: "ใน DevTools → Network คลิกขวาที่คำขอใดก็ได้แล้วเลือก Copy as cURL (หรือคัดลอกส่วนหัว Cookie)",
          label: "คัดลอกเป็น cURL หรือ Cookie",
        },
        paste: {
          body: "วางในหน้าการตั้งค่า แดชบอร์ดจะแยกและดึงเซสชันคุกกี้ของคุณให้อัตโนมัติ",
          label: "วางในหน้าการตั้งค่า",
        },
        signIn: {
          body: "เปิด de.aipass.net แล้วเข้าสู่ระบบ เพื่อให้เบราว์เซอร์มีเซสชันที่ใช้งานอยู่",
          label: "เข้าสู่ระบบ AI Pass",
        },
      },
      title: "เชื่อมต่อเซสชัน AI Pass ของคุณ",
    },
    stats: {
      catalog: {
        builtin: "รายการในตัว เชื่อมต่อเซสชันเพื่อดูของบัญชีคุณ",
        label: "โมเดลที่เข้าถึงได้",
        live: "อ่านสดจากแค็ตตาล็อกในบัญชีของคุณ",
      },
      credits: {
        label: "เครดิตที่ใช้ได้",
        resets: "รีเซ็ต %s",
      },
      free: {
        chat: "ในจำนวนนี้ %s โมเดลรองรับคำขอแบบแชท",
        label: "โมเดลที่ใช้ฟรี",
        priced: "มี %s โมเดลที่มีราคาจาก OpenRouter",
      },
      noSession: "ยังไม่มีเซสชัน",
      used: {
        label: "เครดิตที่ใช้ไป",
        share: "ใช้ไปแล้ว %s% ของรอบนี้",
      },
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
