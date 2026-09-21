/**
 * Temporary sample data for the announcements board.
 * The shape mirrors what the PHP API is expected to return, so the screen can be
 * pointed at `GET /notices` later without touching the components.
 */

export type NoticeUrgency = "normal" | "high";

export interface Notice {
  id: number;
  title_ar: string;
  title_fr: string;
  body_ar: string;
  body_fr: string;
  urgency: NoticeUrgency;
  published_at: string;
  author_name: string;
}

export const MOCK_NOTICES: Notice[] = [
  {
    id: 1,
    title_ar: "الجمعية العامة للمقيمين",
    title_fr: "Assemblée générale des résidents",
    body_ar: "تُعقد الجمعية العامة يوم السبت على الساعة 18:00 أمام مدخل العمارة لمناقشة ميزانية الصيانة.",
    body_fr:
      "L'assemblée générale se tiendra samedi à 18h00 devant l'entrée de l'immeuble pour discuter du budget d'entretien.",
    urgency: "high",
    published_at: "2026-09-05 09:30:00",
    author_name: "المسيّر / Le gérant",
  },
  {
    id: 2,
    title_ar: "صيانة المصعد",
    title_fr: "Maintenance de l'ascenseur",
    body_ar: "سيتوقف المصعد يوم الثلاثاء من 09:00 إلى 13:00 لإجراء الصيانة الدورية.",
    body_fr: "L'ascenseur sera à l'arrêt mardi de 09h00 à 13h00 pour l'entretien périodique.",
    urgency: "high",
    published_at: "2026-09-02 14:10:00",
    author_name: "المسيّر / Le gérant",
  },
  {
    id: 3,
    title_ar: "تنظيف الأقبية",
    title_fr: "Nettoyage des caves",
    body_ar: "يُرجى من السكان إخلاء ممرات الأقبية قبل نهاية الأسبوع لتسهيل عملية التنظيف.",
    body_fr: "Merci de dégager les couloirs des caves avant la fin de la semaine pour faciliter le nettoyage.",
    urgency: "normal",
    published_at: "2026-08-28 10:00:00",
    author_name: "المسيّر / Le gérant",
  },
  {
    id: 4,
    title_ar: "تذكير باشتراكات الصيانة",
    title_fr: "Rappel des cotisations d'entretien",
    body_ar: "يُرجى تسديد اشتراك الشهر الجاري لدى المسيّر مقابل وصل مرقّم.",
    body_fr: "Merci de régler la cotisation du mois auprès du gérant contre un reçu numéroté.",
    urgency: "normal",
    published_at: "2026-08-20 08:45:00",
    author_name: "المسيّر / Le gérant",
  },
];
