export type Category = 'General' | 'OBC' | 'SC' | 'ST' | 'VJ' | 'NT' | 'NT1' | 'NT2' | 'NT3' | 'EWS'
export type MembershipTier = 'Explorer' | 'Guide' | 'Group'
export type SafetyLabel = 'SAFE' | 'MODERATE' | 'REACH'

export type Student = {
  id: string
  name: string
  email: string
  phone: string
  rank: number
  category: Category | null
  region: string | null
  membership_tier: MembershipTier | null
  created_at?: string
  updated_at?: string
}

export type College = {
  id: string
  name: string
  location: string
  district: string
  university: string
  branches: string[]
  fees_general: number | null
  fees_obc: number | null
  fees_sc: number | null
  fees_st: number | null
  photos: string[]
  rating: number | null
  reviews_count: number
  established_year: number | null
  accreditation: string | null
  placement_avg: number | null
}

export type Cutoff = {
  id: string
  college_id: string
  branch: string
  category: Category
  round: string
  year: number
  rank_cutoff?: number
  closing_rank?: number
}

export type Shortlist = {
  id: string
  student_id: string
  college_id: string
  branch: string
  priority_order: number
  notes: string | null
  created_at?: string
  updated_at?: string
}

export type Branch = {
  id: string
  college_id?: string | null
  name?: string | null
  branch?: string | null
  branch_name?: string | null
}

export type Review = {
  id: string
  college_id: string
  student_id?: string | null
  rating: number | null
  review_text?: string | null
  comment?: string | null
  created_at?: string
}

export type CapList = {
  id: string
  student_id: string
  counsellor_notes: string | null
  created_at?: string
  updated_at?: string
}

export type CapListItem = {
  id: string
  cap_list_id: string
  college_id: string
  branch: string
  priority_order: number
  safety_label: SafetyLabel
  notes: string | null
}

export type MatchBand = 'safe' | 'moderate' | 'reach'
