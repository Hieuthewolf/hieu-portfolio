export interface SkillGroup {
  group: string;
  items: readonly string[];
}

export interface Profile {
  name: string;
  role: string;
  tagline: string;
  location: string;
  education: string;
  email: string;
  github: string;
  linkedin: string;
  skills: readonly SkillGroup[];
}

export interface Project {
  id: string;
  index: string;
  year: string;
  title: string;
  org: string;
  blurb: string;
  decision: string;
  metrics: readonly string[];
  tags: readonly string[];
}
