import type { Attendee, Gender, PlayFrequencyPreference } from "./domain";

interface SampleAttendeeInput {
  name: string;
  gender: Gender;
  level: string;
  skillScore: number;
  playCount: number;
  playFrequencyPreference: PlayFrequencyPreference;
}

const SAMPLE_ATTENDEES: SampleAttendeeInput[] = [
  { name: "김도윤", gender: "남", level: "A", skillScore: 88, playCount: 2, playFrequencyPreference: "normal" },
  { name: "박수란", gender: "여", level: "B", skillScore: 76, playCount: 1, playFrequencyPreference: "high" },
  { name: "이지훈", gender: "남", level: "C", skillScore: 61, playCount: 1, playFrequencyPreference: "normal" },
  { name: "최유진", gender: "여", level: "D", skillScore: 48, playCount: 2, playFrequencyPreference: "low" },
  { name: "강민수", gender: "남", level: "B", skillScore: 79, playCount: 0, playFrequencyPreference: "high" },
  { name: "오하나", gender: "여", level: "C", skillScore: 65, playCount: 1, playFrequencyPreference: "normal" },
  { name: "정지우", gender: "남", level: "C", skillScore: 58, playCount: 0, playFrequencyPreference: "low" },
  { name: "한수민", gender: "여", level: "B", skillScore: 73, playCount: 2, playFrequencyPreference: "normal" },
  { name: "문서준", gender: "남", level: "A", skillScore: 91, playCount: 1, playFrequencyPreference: "high" },
  { name: "윤채린", gender: "여", level: "B", skillScore: 74, playCount: 0, playFrequencyPreference: "normal" },
  { name: "서민재", gender: "남", level: "D", skillScore: 45, playCount: 0, playFrequencyPreference: "low" },
  { name: "홍나래", gender: "여", level: "C", skillScore: 63, playCount: 1, playFrequencyPreference: "normal" },
];

export function createSampleAttendees(now = new Date().toISOString()): Attendee[] {
  return SAMPLE_ATTENDEES.map((attendee, index) => ({
    id: `sample-${index + 1}`,
    no: index + 1,
    name: attendee.name,
    joinedAt: "2026. 1. 1",
    level: attendee.level,
    skillScore: attendee.skillScore,
    gender: attendee.gender,
    isStaff: index < 2,
    isExempt: false,
    selectedAt: now,
    playCount: attendee.playCount,
    waitCount: 0,
    playFrequencyPreference: attendee.playFrequencyPreference,
    queueStatus: "normal",
  }));
}
