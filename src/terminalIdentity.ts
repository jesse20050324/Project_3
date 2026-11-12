import type { Channel } from "./engine/types";

// 开机档案的暂用设定，与已审剧本分开维护。
export const terminalUsers: Record<Channel, { id: string; name: string; gender: string; age: number; work: string; city: string }> = {
  left: { id: "01", name: "男生", gender: "男", age: 21, work: "在校大学生", city: "西安" },
  right: { id: "02", name: "女生", gender: "女", age: 22, work: "大学生 · 项目组实习", city: "西安" },
};
