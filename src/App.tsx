import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { jsPDF } from 'jspdf'
import {
  Link,
  NavLink,
  Navigate,
  Route,
  Routes,
  useParams,
  useSearchParams,
} from 'react-router-dom'
import {
  ArrowRight,
  BookOpen,
  Building2,
  Check,
  Download,
  FileText,
  GraduationCap,
  GripVertical,
  LayoutDashboard,
  ListChecks,
  Loader2,
  LockKeyhole,
  LogOut,
  MapPin,
  Menu,
  Search,
  SlidersHorizontal,
  Sparkles,
  Star,
  Trash2,
  X,
} from 'lucide-react'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import type {
  Branch,
  CapList,
  CapListItem,
  Category,
  College,
  Cutoff,
  MatchBand,
  Review,
  Shortlist,
  Student,
} from './types'

const LANDING_URL = 'https://margdarshak.in'

type AppData = {
  colleges: College[]
  cutoffs: Cutoff[]
  shortlists: Shortlist[]
  branches: Branch[]
  reviews: Review[]
  capLists: CapList[]
  capItems: CapListItem[]
}

type EnrichedCollege = {
  college: College
  branch: string
  fees: number | null
  cutoff: Cutoff | null
  cutoffRank: number | null
  band: MatchBand
}

const emptyData: AppData = {
  colleges: [],
  cutoffs: [],
  shortlists: [],
  branches: [],
  reviews: [],
  capLists: [],
  capItems: [],
}

function App() {
  const [student, setStudent] = useState<Student | null>(null)
  const [data, setData] = useState<AppData>(emptyData)
  const [booting, setBooting] = useState(true)
  const [dataLoading, setDataLoading] = useState(false)
  const [isDemo, setIsDemo] = useState(false)
  const [paymentPending, setPaymentPending] = useState(false)

  const loadStudentEnvironment = async (studentId: string) => {
    setDataLoading(true)

    const { data: profile, error: profileError } = await supabase
      .from('students')
      .select('*')
      .eq('id', studentId)
      .single()

    if (profileError) throw profileError
    const loadedStudent = profile as Student

    if (!loadedStudent.membership_tier) {
      window.location.href = `${LANDING_URL}?message=${encodeURIComponent('Please purchase a plan to access Margdarshak Khoj')}`
      return
    }

    if (loadedStudent.payment_status === 'pending') {
      setStudent(loadedStudent)
      setPaymentPending(true)
      setDataLoading(false)
      return
    }

    setPaymentPending(false)

    const category = loadedStudent.category ?? 'General'

    // Check sessionStorage cache
    const cacheKey = `khoj_data_${studentId}`
    const cached = sessionStorage.getItem(cacheKey)
    if (cached) {
      try {
        const parsed = JSON.parse(cached)
        const isValid = parsed && parsed.colleges && parsed.colleges.length > 0 && parsed.colleges.some((c: any) => c.branches && c.branches.length > 0)
        if (isValid) {
          setStudent(loadedStudent)
          setData(parsed)
          setDataLoading(false)
          return
        } else {
          sessionStorage.removeItem(cacheKey)
        }
      } catch (e) {
        sessionStorage.removeItem(cacheKey)
      }
    }

    // Load branches in pages to bypass the 1,000 row limit
    const branchesList: any[] = []
    let branchesPage = 0
    const branchesPageSize = 1000
    while (true) {
      const { data: pageBranches, error } = await supabase
        .from('branches')
        .select('*')
        .range(branchesPage * branchesPageSize, (branchesPage + 1) * branchesPageSize - 1)
      if (error) throw error
      if (!pageBranches || pageBranches.length === 0) break
      branchesList.push(...pageBranches)
      if (pageBranches.length < branchesPageSize) break
      branchesPage++
    }

    const [
      { data: dbColleges },
      { data: shortlists },
      { data: reviews },
      { data: capLists },
    ] = await Promise.all([
      supabase.from('colleges').select('*').order('rating', { ascending: false }),
      supabase.from('shortlists').select('*').eq('student_id', studentId).order('priority_order'),
      supabase.from('reviews').select('*').order('created_at', { ascending: false }),
      supabase.from('cap_lists').select('*').eq('student_id', studentId).order('updated_at', { ascending: false }),
    ])

    const colleges = (dbColleges ?? []).map((c: any) => ({
      ...c,
      location: c.city || c.address || '',
      branches: branchesList.filter((b) => b.college_id === c.id).map((b) => b.branch_name || b.name || ''),
    })) as College[]

    // Find the latest year available in the database
    const { data: maxYearData } = await supabase
      .from('cutoffs')
      .select('year')
      .order('year', { ascending: false })
      .limit(1)
    const latestYear = maxYearData && maxYearData[0] ? maxYearData[0].year : 2024

    // Fetch page 0 of cutoffs for the latest year and the student's category
    const pageSize = 1000
    const { data: firstPage, error: firstPageError, count } = await supabase
      .from('cutoffs')
      .select('college_id,branch_code,category,round,year,closing_rank,opening_rank', { count: 'exact' })
      .eq('category', category)
      .eq('year', latestYear)
      .range(0, pageSize - 1)

    if (firstPageError) throw firstPageError
    const rawCutoffs = [...(firstPage ?? [])]

    if (count && count > pageSize) {
      const remainingPages = Math.ceil(count / pageSize) - 1
      const promises = Array.from({ length: remainingPages }, (_, i) => {
        const pageNum = i + 1
        return supabase
          .from('cutoffs')
          .select('college_id,branch_code,category,round,year,closing_rank,opening_rank')
          .eq('category', category)
          .eq('year', latestYear)
          .range(pageNum * pageSize, (pageNum + 1) * pageSize - 1)
      })

      const results = await Promise.all(promises)
      for (const res of results) {
        if (res.error) throw res.error
        if (res.data) {
          rawCutoffs.push(...res.data)
        }
      }
    }

    const cutoffs = rawCutoffs.map((c: any) => {
      const branchObj = branchesList.find((b) => b.branch_code === c.branch_code)
      return {
        ...c,
        branch: branchObj ? (branchObj.branch_name || branchObj.name || '') : c.branch_code || '',
        round: `Round ${c.round}`,
        rank_cutoff: c.closing_rank ?? c.opening_rank ?? 0,
      }
    }) as Cutoff[]

    const capListIds = ((capLists ?? []) as CapList[]).map((list) => list.id)
    const { data: capItems } = capListIds.length
      ? await supabase.from('cap_list_items').select('*').in('cap_list_id', capListIds).order('priority_order')
      : { data: [] }

    const mappedCapItems = (capItems ?? []).map((item: any) => {
      const branchRecord = branchesList.find(
        (b) => b.branch_code === item.branch_code && b.college_id === item.college_id
      )
      return {
        ...item,
        branch: branchRecord ? (branchRecord.branch_name || branchRecord.name || '') : item.branch_code || '',
      }
    })

    setStudent(loadedStudent)
    const freshData = {
      colleges,
      cutoffs,
      shortlists: (shortlists ?? []) as Shortlist[],
      branches: branchesList as Branch[],
      reviews: (reviews ?? []) as Review[],
      capLists: (capLists ?? []) as CapList[],
      capItems: mappedCapItems as CapListItem[],
    }
    setData(freshData)
    try {
      sessionStorage.setItem(cacheKey, JSON.stringify(freshData))
    } catch (e) {
      console.warn('Failed to cache data in sessionStorage', e)
    }
    setDataLoading(false)
  }

  useEffect(() => {
    if (student && data !== emptyData) {
      try {
        sessionStorage.setItem(`khoj_data_${student.id}`, JSON.stringify(data))
      } catch (e) {
        console.warn('Failed to cache data in sessionStorage', e)
      }
    }
  }, [data, student])

  useEffect(() => {
    const boot = async () => {
      if (!isSupabaseConfigured) {
        setBooting(false)
        return
      }

      const { data: sessionData } = await supabase.auth.getSession()
      if (sessionData.session?.user) {
        try {
          await loadStudentEnvironment(sessionData.session.user.id)
        } catch {
          await supabase.auth.signOut()
        }
      }
      setBooting(false)
    }

    void boot()
  }, [])


  const logout = async () => {
    if (student) sessionStorage.removeItem(`khoj_data_${student.id}`)
    if (!isDemo && isSupabaseConfigured) await supabase.auth.signOut()
    setStudent(null)
    setData(emptyData)
    setIsDemo(false)
  }

  const touchStudent = async () => {
    if (!student || isDemo) return
    await supabase.from('students').update({ updated_at: new Date().toISOString() }).eq('id', student.id)
  }

  const addToShortlist = async (college: College, branch: string) => {
    if (!student) return
    const exists = data.shortlists.some((item) => item.college_id === college.id && item.branch === branch)
    if (exists) return
    // Unlimited shortlisting for all plans

    const nextOrder = data.shortlists.length + 1
    if (isDemo) {
      setData((current) => ({
        ...current,
        shortlists: [
          ...current.shortlists,
          {
            id: `demo-shortlist-${Date.now()}`,
            student_id: student.id,
            college_id: college.id,
            branch,
            priority_order: nextOrder,
            notes: '',
          },
        ],
      }))
      return
    }

    const { data: inserted, error } = await supabase
      .from('shortlists')
      .insert({
        student_id: student.id,
        college_id: college.id,
        branch,
        priority_order: nextOrder,
        notes: '',
      })
      .select('*')
      .single()

    if (!error && inserted) {
      setData((current) => ({ ...current, shortlists: [...current.shortlists, inserted as Shortlist] }))
      await touchStudent()
    }
  }

  const removeShortlist = async (id: string) => {
    const next = data.shortlists
      .filter((item) => item.id !== id)
      .map((item, index) => ({ ...item, priority_order: index + 1 }))
    setData((current) => ({ ...current, shortlists: next }))

    if (!isDemo) {
      await supabase.from('shortlists').delete().eq('id', id)
      await Promise.all(next.map((item) => supabase.from('shortlists').update({ priority_order: item.priority_order }).eq('id', item.id)))
      await touchStudent()
    }
  }

  const updateShortlistNotes = async (id: string, notes: string) => {
    setData((current) => ({
      ...current,
      shortlists: current.shortlists.map((item) => (item.id === id ? { ...item, notes } : item)),
    }))

    if (!isDemo) {
      await supabase.from('shortlists').update({ notes, updated_at: new Date().toISOString() }).eq('id', id)
      await touchStudent()
    }
  }

  const moveShortlist = async (id: string, direction: -1 | 1) => {
    const ordered = [...data.shortlists].sort((a, b) => a.priority_order - b.priority_order)
    const index = ordered.findIndex((item) => item.id === id)
    const swapIndex = index + direction
    if (index < 0 || swapIndex < 0 || swapIndex >= ordered.length) return

    const next = [...ordered]
    const current = next[index]
    next[index] = next[swapIndex]
    next[swapIndex] = current
    const withPriority = next.map((item, itemIndex) => ({ ...item, priority_order: itemIndex + 1 }))
    setData((currentData) => ({ ...currentData, shortlists: withPriority }))

    if (!isDemo) {
      await Promise.all(
        withPriority.map((item) =>
          supabase.from('shortlists').update({ priority_order: item.priority_order, updated_at: new Date().toISOString() }).eq('id', item.id),
        ),
      )
      await touchStudent()
    }
  }

  if (booting) return <LoadingScreen />
  if (!student) return <LoginPage onLoginSuccess={loadStudentEnvironment} />

  if (paymentPending) {
    return <PaymentPendingPage student={student} onLogout={logout} onCheckStatus={() => loadStudentEnvironment(student.id)} />
  }

  const isPremium = hasPremiumAccess()

  return (
    <Shell student={student} isDemo={isDemo} onLogout={logout}>
      {dataLoading ? (
        <LoadingPanel label="Loading Margdarshak Khoj..." />
      ) : (
        <Routes>
          <Route path="/" element={<DashboardPage student={student} colleges={data.colleges} cutoffs={data.cutoffs} shortlists={data.shortlists} />} />
          <Route
            path="/search"
            element={<SearchPage student={student} colleges={data.colleges} cutoffs={data.cutoffs} branches={data.branches} onAddToShortlist={addToShortlist} />}
          />
          <Route
            path="/college/:id"
            element={<CollegeProfilePage student={student} data={data} onAddToShortlist={addToShortlist} />}
          />
          <Route
            path="/recommendations"
            element={
              isPremium ? (
                <RecommendationsPage student={student} colleges={data.colleges} cutoffs={data.cutoffs} onAddToShortlist={addToShortlist} />
              ) : (
                <UpgradePage title="Recommendations are included in the Guide plan" />
              )
            }
          />
          <Route
            path="/cap-list"
            element={isPremium ? <MyCapListPage student={student} data={data} /> : <UpgradePage title="My CAP List is included in the Guide plan" />}
          />
          <Route
            path="/shortlist"
            element={
              <ShortlistPage
                student={student}
                colleges={data.colleges}
                cutoffs={data.cutoffs}
                shortlists={data.shortlists}
                onMove={moveShortlist}
                onRemove={removeShortlist}
                onNotes={updateShortlistNotes}
              />
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      )}
    </Shell>
  )
}

function LoginPage({ onLoginSuccess }: { onLoginSuccess: (studentId: string) => Promise<void> }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const login = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    if (!isSupabaseConfigured) {
      setError('Supabase env values are missing. Please configure Supabase settings.')
      return
    }

    setLoading(true)
    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (signInError) throw signInError
      if (!data.user) throw new Error('Login succeeded, but no student user was returned.')
      await onLoginSuccess(data.user.id)
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not log in.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#185FA5] px-5 py-8 text-white">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl items-center gap-10 lg:grid-cols-[1fr_430px]">
        <section>
          <div className="inline-flex items-center gap-2 rounded-md border border-white/20 bg-white/10 px-3 py-2 text-sm font-bold text-orange-100">
            <GraduationCap className="size-4" />
            Margdarshak Khoj
          </div>
          <h1 className="mt-6 max-w-3xl text-4xl font-black leading-tight sm:text-6xl">
            मार्गदर्शक खोज
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-blue-50">
            Search colleges, compare cutoffs, save your shortlist, and view your counsellor-prepared CAP list from one account.
          </p>
        </section>

        <form onSubmit={login} className="rounded-md bg-white p-6 text-slate-950 shadow-2xl sm:p-8">
          <div className="grid size-12 place-items-center rounded-md bg-[#185FA5] text-white">
            <LockKeyhole className="size-6" />
          </div>
          <h2 className="mt-5 text-2xl font-black text-[#185FA5]">Student login</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">Use the email and password created on Margdarshak Landing.</p>
          <label className="mt-6 grid gap-2 text-sm font-bold text-[#185FA5]">
            Email
            <input className="input" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label className="mt-4 grid gap-2 text-sm font-bold text-[#185FA5]">
            Password
            <input className="input" type="password" required value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          {error ? <p className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p> : null}
          <button
            type="submit"
            disabled={loading}
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-md bg-[#F97316] px-5 py-3.5 text-sm font-black text-white transition hover:bg-orange-600 disabled:opacity-70"
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
            Login to Khoj
          </button>
        </form>
      </div>
    </main>
  )
}

function Shell({ student, isDemo, onLogout, children }: { student: Student; isDemo: boolean; onLogout: () => void; children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const isPremium = hasPremiumAccess()
  const navItems = [
    { to: '/', label: 'Home', icon: LayoutDashboard },
    { to: '/search', label: 'Search', icon: Search },
    { to: '/recommendations', label: 'Recommendations', icon: Sparkles, locked: !isPremium },
    { to: '/cap-list', label: 'My CAP List', icon: FileText, locked: !isPremium },
    { to: '/shortlist', label: 'Shortlist', icon: ListChecks },
  ]

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-40 bg-[#185FA5] text-white shadow-lg shadow-blue-950/10">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 lg:px-8">
          <Link to="/" className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-md bg-[#F97316]">
              <GraduationCap className="size-6" />
            </span>
            <span>
              <span className="block text-base font-black leading-none">Margdarshak Khoj</span>
              <span className="block text-xs font-bold text-orange-100">मार्गदर्शक खोज</span>
            </span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-bold transition ${
                    isActive ? 'bg-white text-[#185FA5]' : 'text-blue-100 hover:bg-white/10 hover:text-white'
                  }`
                }
              >
                <item.icon className="size-4" />
                {item.label}
                {item.locked ? <LockKeyhole className="size-3" /> : null}
              </NavLink>
            ))}
          </nav>

          <div className="hidden items-center gap-4 md:flex">
            <div className="text-right">
              <p className="text-sm font-black">{student.name}</p>
              <p className="text-xs font-bold text-blue-100">Rank {student.rank.toLocaleString('en-IN')}</p>
            </div>
            <span className="rounded-md bg-white px-3 py-1 text-xs font-black text-[#185FA5]">{student.membership_tier}</span>
            {isDemo ? <span className="rounded-md bg-[#F97316] px-2 py-1 text-xs font-black">Demo</span> : null}
            <button type="button" onClick={onLogout} className="grid size-10 place-items-center rounded-md border border-white/20 text-blue-100 hover:bg-white/10" aria-label="Log out">
              <LogOut className="size-4" />
            </button>
          </div>

          <button type="button" onClick={() => setMobileOpen((open) => !open)} className="grid size-10 place-items-center rounded-md border border-white/20 md:hidden" aria-label="Toggle menu">
            {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>

        {mobileOpen ? (
          <div className="border-t border-white/10 px-4 pb-4 md:hidden">
            <div className="mb-3 rounded-md bg-white/10 p-3">
              <p className="font-black">{student.name}</p>
              <p className="text-sm font-bold text-blue-100">Rank {student.rank.toLocaleString('en-IN')} · {student.membership_tier}</p>
            </div>
            <div className="grid gap-2">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    `inline-flex items-center gap-2 rounded-md px-3 py-3 text-sm font-bold ${
                      isActive ? 'bg-white text-[#185FA5]' : 'bg-white/5 text-blue-100'
                    }`
                  }
                >
                  <item.icon className="size-4" />
                  {item.label}
                  {item.locked ? <LockKeyhole className="size-3" /> : null}
                </NavLink>
              ))}
              <button type="button" onClick={onLogout} className="rounded-md bg-[#F97316] px-3 py-3 text-sm font-black">Logout</button>
            </div>
          </div>
        ) : null}
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 lg:px-8 lg:py-8">{children}</main>
    </div>
  )
}

function DashboardPage({ student, colleges, cutoffs, shortlists }: { student: Student; colleges: College[]; cutoffs: Cutoff[]; shortlists: Shortlist[] }) {
  const category = normalizedCategory(student)
  const safeCount = colleges.filter((college) => enrichCollege(college, cutoffs, student, category).band === 'safe').length
  return (
    <div className="grid gap-6">
      <section className="rounded-md bg-[#185FA5] p-5 text-white shadow-xl shadow-blue-950/10 lg:p-8">
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-orange-200">Welcome to Margdarshak Khoj</p>
        <h1 className="mt-3 text-3xl font-black leading-tight sm:text-5xl">{student.name}</h1>
        <p className="mt-4 max-w-3xl text-lg leading-8 text-blue-50">
          Your rank is <strong>{student.rank.toLocaleString('en-IN')}</strong>. Search colleges, save unlimited shortlist options, and track your CAP readiness.
        </p>
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric value={colleges.length.toString()} label="Colleges" />
          <Metric value={safeCount.toString()} label="Safe options" />
          <Metric value={shortlists.length.toString()} label="Shortlisted" />
          <Metric value={student.membership_tier ?? 'No plan'} label="Plan" />
        </div>
      </section>
      {!hasPremiumAccess() ? <UpgradeBanner /> : null}
    </div>
  )
}

function SearchPage({
  student,
  colleges,
  cutoffs,
  branches,
  onAddToShortlist,
}: {
  student: Student
  colleges: College[]
  cutoffs: Cutoff[]
  branches: Branch[]
  onAddToShortlist: (college: College, branch: string) => Promise<void>
}) {
  const [showFilters, setShowFilters] = useState(false)
  const [params] = useSearchParams()
  const [query, setQuery] = useState(params.get('q') ?? '')
  const [district, setDistrict] = useState('')
  const [branch, setBranch] = useState('')
  const [university, setUniversity] = useState('')
  const [maxFees, setMaxFees] = useState(200000)
  const [sortBy, setSortBy] = useState('cutoff')
  const [page, setPage] = useState(1)
  const category = normalizedCategory(student)

  const districts = useMemo(() => Array.from(new Set(colleges.map((college) => college.district))).sort(), [colleges])
  const universities = useMemo(() => Array.from(new Set(colleges.map((college) => college.university))).sort(), [colleges])
  const branchOptions = useMemo(() => {
    const fromTable = branches.map(branchName).filter(Boolean)
    const fromColleges = colleges.flatMap((college) => college.branches)
    return Array.from(new Set([...fromTable, ...fromColleges])).sort()
  }, [branches, colleges])

  const results = useMemo(() => {
    const filtered = colleges
      .filter((college) => {
        const haystack = `${college.name} ${college.location} ${college.district} ${college.university} ${college.branches.join(' ')}`.toLowerCase()
        const fee = feeForCategory(college, category)
        return (
          (!query || haystack.includes(query.toLowerCase())) &&
          (!district || college.district === district) &&
          (!branch || college.branches.includes(branch)) &&
          (!university || college.university === university) &&
          (fee === null || fee <= maxFees)
        )
      })
      .map((college) => enrichCollege(college, cutoffs, student, category, branch || undefined))

    return filtered.sort((a, b) => {
      if (sortBy === 'fees') return (a.fees ?? Number.MAX_SAFE_INTEGER) - (b.fees ?? Number.MAX_SAFE_INTEGER)
      if (sortBy === 'rating') return (b.college.rating ?? 0) - (a.college.rating ?? 0)
      return (b.cutoffRank ?? 0) - (a.cutoffRank ?? 0)
    })
  }, [branch, category, colleges, cutoffs, district, maxFees, query, sortBy, student, university])

  const pageSize = 6
  const totalPages = Math.max(1, Math.ceil(results.length / pageSize))
  const paged = results.slice((page - 1) * pageSize, page * pageSize)

  return (
    <div className="grid gap-6">
      <PageHeading icon={Search} title="Search & Filter" text="Find colleges using your category, rank, branch, fees, and district filters." />
      <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-sm font-black text-[#185FA5]">
            <SlidersHorizontal className="size-4" />
            Filters
          </div>
          <button
            type="button"
            onClick={() => setShowFilters((f) => !f)}
            className="rounded-md border border-[#185FA5]/20 px-3 py-1.5 text-xs font-black text-[#185FA5] hover:bg-blue-50 md:hidden"
          >
            {showFilters ? 'Hide Filters' : 'Show Filters'}
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input className="input" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1) }} placeholder="Search college..." />
          
          <div className={`${showFilters ? 'contents' : 'hidden md:contents'}`}>
            <select className="input" value={district} onChange={(event) => { setDistrict(event.target.value); setPage(1) }}>
              <option value="">All districts</option>
              {districts.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <select className="input" value={branch} onChange={(event) => { setBranch(event.target.value); setPage(1) }}>
              <option value="">All branches</option>
              {branchOptions.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <select className="input" value={university} onChange={(event) => { setUniversity(event.target.value); setPage(1) }}>
              <option value="">All universities</option>
              {universities.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <label className="grid gap-1 text-sm font-bold text-[#185FA5]">
              Fees up to {formatCurrency(maxFees)}
              <input type="range" min="20000" max="250000" step="5000" value={maxFees} onChange={(event) => { setMaxFees(Number(event.target.value)); setPage(1) }} />
            </label>
            <input className="input bg-slate-50" value={category} readOnly aria-label="Category from profile" />
            <select className="input" value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
              <option value="cutoff">Sort by cut-off rank</option>
              <option value="fees">Fees low to high</option>
              <option value="rating">Sort by rating</option>
            </select>
          </div>
        </div>
      </section>

      {paged.length ? (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            {paged.map((result) => <CollegeCard key={`${result.college.id}-${result.branch}`} result={result} student={student} onAdd={onAddToShortlist} />)}
          </div>
          <Pagination page={page} totalPages={totalPages} onPage={setPage} />
        </>
      ) : (
        <EmptyState title="No colleges found" text="Try removing one filter or increasing the fees range." />
      )}
    </div>
  )
}

function CollegeProfilePage({ student, data, onAddToShortlist }: { student: Student; data: AppData; onAddToShortlist: (college: College, branch: string) => Promise<void> }) {
  const { id } = useParams()
  const college = data.colleges.find((item) => item.id === id)
  const [branch, setBranch] = useState(college?.branches[0] ?? '')
  const category = normalizedCategory(student)
  const [history, setHistory] = useState<Cutoff[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  useEffect(() => {
    if (college) setBranch(college.branches[0] ?? '')
  }, [college])

  useEffect(() => {
    if (!college) return
    const fetchHistory = async () => {
      setLoadingHistory(true)
      try {
        const { data: dbHistory, error } = await supabase
          .from('cutoffs')
          .select('*')
          .eq('college_id', college.id)
          .eq('category', category)
        if (error) throw error

        const mappedHistory = (dbHistory ?? []).map((c: any) => {
          const branchObj = data.branches.find((b: any) => b.branch_code === c.branch_code)
          return {
            ...c,
            branch: branchObj ? (branchObj.branch_name || branchObj.name || '') : c.branch_code || '',
            round: `Round ${c.round}`,
            rank_cutoff: c.closing_rank ?? c.opening_rank ?? 0,
          }
        })
        setHistory(mappedHistory.sort((a, b) => b.year - a.year || a.round.localeCompare(b.round)).slice(0, 9))
      } catch (err) {
        console.error('Failed to fetch cutoff history:', err)
      } finally {
        setLoadingHistory(false)
      }
    }
    void fetchHistory()
  }, [college?.id, category, data.branches])

  if (!college) return <EmptyState title="College not found" text="Go back to search and select a valid college." />
  const shortlisted = data.shortlists.some((item) => item.college_id === college.id && item.branch === branch)
  const reviews = data.reviews.filter((review) => review.college_id === college.id)

  return (
    <div className="grid gap-6">
      <header className="overflow-hidden rounded-md border border-slate-200 bg-[#185FA5] p-6 text-white shadow-sm sm:p-8">
        <div>
          <p className="text-sm font-bold text-orange-200">{college.university}</p>
          <h1 className="mt-2 text-3xl font-black sm:text-5xl">{college.name}</h1>
          <p className="mt-2 flex items-center gap-2 text-sm font-bold text-blue-100"><MapPin className="size-4" />{college.district}</p>
        </div>
      </header>

      <section className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="rounded-md border border-slate-200 bg-white p-5 shadow-sm lg:order-2">
          <label className="grid gap-2 text-sm font-bold text-[#185FA5]">
            Branch for shortlist
            <select className="input" value={branch} onChange={(event) => setBranch(event.target.value)}>
              {college.branches.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <button type="button" disabled={shortlisted} onClick={() => onAddToShortlist(college, branch)} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md bg-[#F97316] px-4 py-3 text-sm font-black text-white hover:bg-orange-600 disabled:bg-slate-300">
            <Check className="size-4" />
            {shortlisted ? 'Already shortlisted' : 'Add to shortlist'}
          </button>
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-5 shadow-sm lg:order-1">
          <SectionTitle icon={BookOpen} title="About college" text="Core details used while comparing this college for CAP planning." />
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <Info label="University" value={college.university} />
            <Info label="District" value={college.district} />
            <Info label="Established" value={college.established_year?.toString() ?? 'Not listed'} />
            <Info label="Accreditation" value={college.accreditation ?? 'Not listed'} />
          </div>
        </div>
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <SectionTitle icon={ListChecks} title={`Branch-wise fees for ${category}`} text="Fees are filtered to your category where available." />
        <div className="mt-5 overflow-x-auto scrollbar-soft">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-[0.12em] text-slate-500">
              <tr><th className="px-4 py-3">Branch</th><th className="px-4 py-3">Fees</th><th className="px-4 py-3">Latest cutoff</th><th className="px-4 py-3">Rank match</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {college.branches.map((item) => {
                const cutoff = latestCutoff(data.cutoffs, college.id, item, category)
                const rank = cutoffRank(cutoff)
                return (
                  <tr key={item}>
                    <td className="px-4 py-4 font-bold text-[#185FA5]">{item}</td>
                    <td className="px-4 py-4">{formatCurrency(feeForCategory(college, category))}</td>
                    <td className="px-4 py-4">{rank ? rank.toLocaleString('en-IN') : 'No cutoff'}</td>
                    <td className="px-4 py-4"><BandPill band={matchBand(student.rank, rank)} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <SectionTitle icon={FileText} title="Cut-off history" text="Last 3 years, all available rounds, for your category." />
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-[0.12em] text-slate-500">
              <tr><th className="px-4 py-3">Year</th><th className="px-4 py-3">Round</th><th className="px-4 py-3">Branch</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">Cutoff rank</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loadingHistory ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500 font-semibold">
                    <Loader2 className="mx-auto size-5 animate-spin text-[#F97316] mb-2" />
                    Loading cutoff history...
                  </td>
                </tr>
              ) : history.length ? (
                history.map((cutoff) => (
                  <tr key={cutoff.id}>
                    <td className="px-4 py-4">{cutoff.year}</td>
                    <td className="px-4 py-4">{cutoff.round}</td>
                    <td className="px-4 py-4 font-bold text-[#185FA5]">{cutoff.branch}</td>
                    <td className="px-4 py-4">{cutoff.category}</td>
                    <td className="px-4 py-4 font-black text-[#F97316]">{cutoffRank(cutoff)?.toLocaleString('en-IN') ?? 'NA'}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500 font-semibold">
                    No cutoff history available for your category.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
        <SectionTitle icon={Star} title="Reviews" text="Student feedback from the MargDarshak reviews table." />
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {reviews.length ? reviews.map((review) => (
            <div key={review.id} className="rounded-md bg-slate-50 p-4">
              <div className="flex gap-1 text-[#F97316]">{Array.from({ length: Math.max(1, review.rating ?? 5) }, (_, index) => <Star key={index} className="size-4 fill-current" />)}</div>
              <p className="mt-3 text-sm font-semibold leading-6 text-slate-700">"{review.review_text ?? review.comment ?? 'Helpful college review.'}"</p>
            </div>
          )) : <EmptyState title="No reviews yet" text="Reviews will appear here once students add them." compact />}
        </div>
      </section>
    </div>
  )
}

function RecommendationsPage({ student, colleges, cutoffs, onAddToShortlist }: { student: Student; colleges: College[]; cutoffs: Cutoff[]; onAddToShortlist: (college: College, branch: string) => Promise<void> }) {
  const category = normalizedCategory(student)

  // Prioritize region match first, then by rating
  const sortedColleges = useMemo(() => {
    return [...colleges].sort((a, b) => {
      if (student.region) {
        const aRegion = a.district === student.region
        const bRegion = b.district === student.region
        if (aRegion && !bRegion) return -1
        if (!aRegion && bRegion) return 1
      }
      return (b.rating ?? 0) - (a.rating ?? 0)
    })
  }, [colleges, student.region])

  const enriched = useMemo(() => {
    return sortedColleges.map((college) => enrichCollege(college, cutoffs, student, category))
  }, [sortedColleges, cutoffs, student, category])

  const byBand = useMemo(() => {
    return {
      safe: enriched.filter((item) => item.band === 'safe').slice(0, 5),
      moderate: enriched.filter((item) => item.band === 'moderate').slice(0, 5),
      reach: enriched.filter((item) => item.band === 'reach').slice(0, 5),
    }
  }, [enriched])

  return (
    <div className="grid gap-6">
      <PageHeading icon={Sparkles} title="AI Recommendations" text={`Using rank ${student.rank.toLocaleString('en-IN')}, ${category} category, and ${student.region ?? 'all Maharashtra'} district.`} />
      <RecommendationBand title="Safe colleges" items={byBand.safe} student={student} onAdd={onAddToShortlist} />
      <RecommendationBand title="Moderate colleges" items={byBand.moderate} student={student} onAdd={onAddToShortlist} />
      <RecommendationBand title="Reach colleges" items={byBand.reach} student={student} onAdd={onAddToShortlist} />
    </div>
  )
}

function MyCapListPage({ student, data }: { student: Student; data: AppData }) {
  const capList = data.capLists.find((list) => list.student_id === student.id)
  const items = capList ? data.capItems.filter((item) => item.cap_list_id === capList.id).sort((a, b) => a.priority_order - b.priority_order) : []

  const downloadPdf = () => {
    if (!items.length) return
    const doc = new jsPDF()
    doc.setFontSize(18)
    doc.text('Margdarshak Khoj - My CAP List', 14, 18)
    doc.setFontSize(11)
    doc.text(`Student: ${student.name}`, 14, 30)
    doc.text(`Rank: ${student.rank.toLocaleString('en-IN')} | Category: ${student.category ?? 'NA'} | District: ${student.region ?? 'NA'}`, 14, 38)
    let y = 52
    items.forEach((item) => {
      const college = data.colleges.find((collegeItem) => collegeItem.id === item.college_id)
      doc.text(`${item.priority_order}. ${college?.name ?? item.college_id} - ${item.branch} [${item.safety_label}]`.slice(0, 95), 14, y)
      y += 7
      if (item.notes) {
        doc.text(`Notes: ${item.notes}`.slice(0, 95), 20, y)
        y += 7
      }
      if (y > 280) {
        doc.addPage()
        y = 18
      }
    })
    doc.save(`${student.name.replace(/\s+/g, '-')}-cap-list.pdf`)
  }

  return (
    <div className="grid gap-6">
      <PageHeading icon={FileText} title="My CAP List" text="Your counsellor-prepared final preference list." />
      {items.length ? (
        <>
          <div className="flex flex-col sm:flex-row sm:justify-end">
            <button onClick={downloadPdf} className="inline-flex items-center justify-center gap-2 rounded-md bg-[#F97316] px-4 py-3 font-black text-white hover:bg-orange-600 w-full sm:w-auto">
              <Download className="size-4" />
              Download PDF
            </button>
          </div>
          <div className="grid gap-3">
            {items.map((item) => {
              const college = data.colleges.find((collegeItem) => collegeItem.id === item.college_id)
              return (
                <article key={item.id} className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-lg font-black text-[#185FA5]">{item.priority_order}. {college?.name ?? item.college_id}</p>
                      <p className="mt-1 text-sm font-bold text-slate-500">{item.branch}</p>
                      {item.notes ? <p className="mt-3 text-sm font-semibold text-slate-700">{item.notes}</p> : null}
                    </div>
                    <SafetyPill label={item.safety_label} />
                  </div>
                </article>
              )
            })}
          </div>
        </>
      ) : (
        <EmptyState title="Your counsellor is preparing your CAP list." text="You will be notified on WhatsApp once it is ready." />
      )}
    </div>
  )
}

function ShortlistPage({ student, colleges, cutoffs, shortlists, onMove, onRemove, onNotes }: { student: Student; colleges: College[]; cutoffs: Cutoff[]; shortlists: Shortlist[]; onMove: (id: string, direction: -1 | 1) => Promise<void>; onRemove: (id: string) => Promise<void>; onNotes: (id: string, notes: string) => Promise<void> }) {
  const category = normalizedCategory(student)
  const ordered = [...shortlists].sort((a, b) => a.priority_order - b.priority_order)

  return (
    <div className="grid gap-6">
      <PageHeading icon={ListChecks} title="My Shortlist" text="Reorder colleges, add notes, and sync your list with your counsellor." />
      {ordered.length ? (
        <div className="grid gap-4">
          {ordered.map((item, index) => {
            const college = colleges.find((entry) => entry.id === item.college_id)
            if (!college) return null
            const cutoff = latestCutoff(cutoffs, college.id, item.branch, category)
            const rank = cutoffRank(cutoff)
            return (
              <article key={item.id} className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
                <div className="grid gap-4 lg:grid-cols-[56px_1fr_220px] lg:items-start">
                  <div className="flex items-center gap-3 lg:grid lg:gap-2">
                    <span className="grid size-10 place-items-center rounded-md bg-blue-50 text-lg font-black text-[#185FA5]">{index + 1}</span>
                    <GripVertical className="size-5 text-slate-400" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-black text-[#185FA5]">{college.name}</h2>
                      <BandPill band={matchBand(student.rank, rank)} />
                    </div>
                    <p className="mt-2 text-sm font-bold text-slate-500">{item.branch} · {college.location}</p>
                    <p className="mt-3 text-sm font-semibold text-slate-700">
                      Fees: {formatCurrency(feeForCategory(college, category))} · Cutoff: {rank ? rank.toLocaleString('en-IN') : 'No cutoff'}
                    </p>
                    <textarea className="input mt-4 min-h-24 resize-y" value={item.notes ?? ''} onChange={(event) => onNotes(item.id, event.target.value)} placeholder="Add notes for counsellor review..." />
                  </div>
                  <div className="grid gap-2">
                    <Link to={`/college/${college.id}`} className="rounded-md border border-[#185FA5]/20 px-4 py-3 text-center text-sm font-black text-[#185FA5] hover:bg-blue-50">View profile</Link>
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => onMove(item.id, -1)} className="rounded-md bg-slate-100 px-3 py-2 text-sm font-black text-slate-700">Up</button>
                      <button type="button" onClick={() => onMove(item.id, 1)} className="rounded-md bg-slate-100 px-3 py-2 text-sm font-black text-slate-700">Down</button>
                    </div>
                    <button type="button" onClick={() => onRemove(item.id)} className="inline-flex items-center justify-center gap-2 rounded-md bg-red-50 px-4 py-3 text-sm font-black text-red-700">
                      <Trash2 className="size-4" />
                      Remove
                    </button>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      ) : (
        <EmptyState title="No colleges shortlisted yet" text="Search colleges and use Add to shortlist to start your CAP list." />
      )}
    </div>
  )
}

function CollegeCard({ result, student, onAdd }: { result: EnrichedCollege; student: Student; onAdd: (college: College, branch: string) => Promise<void> }) {
  const isSafe = result.band === 'safe'
  return (
    <article className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl">
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-black leading-tight text-[#185FA5]">{result.college.name}</h2>
            <p className="mt-2 flex items-center gap-2 text-sm font-bold text-slate-500"><MapPin className="size-4" />{result.college.district}</p>
          </div>
          <BandPill band={result.band} />
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
          <Info label="Top branch" value={result.branch} />
          <Info label={`${normalizedCategory(student)} fees`} value={formatCurrency(result.fees)} />
          <Info label="Cut-off" value={result.cutoffRank ? result.cutoffRank.toLocaleString('en-IN') : 'No cutoff'} />
          <Info label="Rating" value={`${result.college.rating ?? 'NA'} / 5`} />
        </div>
        <p className={`mt-4 rounded-md px-3 py-2 text-sm font-bold ${isSafe ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
          Your rank: {student.rank.toLocaleString('en-IN')} · {isSafe ? 'Green: safer cutoff match' : 'Red: out of reach or competitive'}
        </p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <Link to={`/college/${result.college.id}`} className="inline-flex flex-1 items-center justify-center rounded-md bg-[#185FA5] px-4 py-3 text-sm font-black text-white hover:bg-blue-700">View profile</Link>
          <button type="button" onClick={() => onAdd(result.college, result.branch)} className="inline-flex flex-1 items-center justify-center gap-2 rounded-md border border-orange-300 px-4 py-3 text-sm font-black text-orange-700 hover:bg-orange-50">
            <Check className="size-4" />
            Add shortlist
          </button>
        </div>
      </div>
    </article>
  )
}

function RecommendationBand({ title, items, student, onAdd }: { title: string; items: EnrichedCollege[]; student: Student; onAdd: (college: College, branch: string) => Promise<void> }) {
  return (
    <section className="grid gap-4">
      <h2 className="text-2xl font-black text-[#185FA5]">{title}</h2>
      {items.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {items.map((item) => <CollegeCard key={`${title}-${item.college.id}-${item.branch}`} result={item} student={student} onAdd={onAdd} />)}
        </div>
      ) : (
        <EmptyState title={`No ${title.toLowerCase()} yet`} text="Add more cutoff data or broaden the district filter." compact />
      )}
    </section>
  )
}

function UpgradePage({ title }: { title: string }) {
  return (
    <div className="grid gap-6">
      <PageHeading icon={LockKeyhole} title={title} text="Upgrade to the Guide plan to unlock counsellor-backed recommendations and CAP list access." />
      <UpgradeBanner />
    </div>
  )
}

function UpgradeBanner() {
  return (
    <section className="rounded-md border border-orange-200 bg-orange-50 p-5">
      <h2 className="text-xl font-black text-orange-800">Upgrade for full counselling support</h2>
      <p className="mt-2 max-w-3xl font-semibold leading-7 text-orange-900">
        Explorer gives you search, filters, profiles, cutoff history, and 10 saved colleges. The Guide plan unlocks recommendations and your counsellor-prepared CAP list.
      </p>
      <a href={LANDING_URL} className="mt-4 inline-flex rounded-md bg-[#F97316] px-4 py-3 text-sm font-black text-white hover:bg-orange-600">
        Upgrade plan
      </a>
    </section>
  )
}

function Pagination({ page, totalPages, onPage }: { page: number; totalPages: number; onPage: (page: number) => void }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-slate-200 bg-white p-3">
      <button disabled={page === 1} onClick={() => onPage(page - 1)} className="rounded-md border border-slate-200 px-4 py-2 text-sm font-black disabled:opacity-40">Previous</button>
      <p className="text-sm font-bold text-slate-600">Page {page} of {totalPages}</p>
      <button disabled={page === totalPages} onClick={() => onPage(page + 1)} className="rounded-md border border-slate-200 px-4 py-2 text-sm font-black disabled:opacity-40">Next</button>
    </div>
  )
}

function LoadingScreen() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#185FA5] text-white">
      <div className="text-center">
        <Loader2 className="mx-auto size-8 animate-spin text-orange-300" />
        <p className="mt-4 font-bold">Opening Margdarshak Khoj...</p>
      </div>
    </main>
  )
}

function LoadingPanel({ label }: { label: string }) {
  return (
    <div className="grid min-h-[360px] place-items-center rounded-md border border-slate-200 bg-white">
      <div className="text-center">
        <Loader2 className="mx-auto size-8 animate-spin text-[#F97316]" />
        <p className="mt-4 font-bold text-[#185FA5]">{label}</p>
      </div>
    </div>
  )
}

function PageHeading({ icon: Icon, title, text }: { icon: typeof Search; title: string; text: string }) {
  return (
    <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex gap-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-md bg-blue-50 text-[#185FA5]"><Icon className="size-6" /></span>
        <div>
          <h1 className="text-3xl font-black text-[#185FA5]">{title}</h1>
          <p className="mt-2 max-w-3xl leading-7 text-slate-600">{text}</p>
        </div>
      </div>
    </section>
  )
}

function SectionTitle({ icon: Icon, title, text }: { icon: typeof BookOpen; title: string; text: string }) {
  return (
    <div className="flex gap-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-md bg-blue-50 text-[#185FA5]"><Icon className="size-5" /></span>
      <div>
        <h2 className="text-xl font-black text-[#185FA5]">{title}</h2>
        <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">{text}</p>
      </div>
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-slate-50 p-3">
      <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="mt-1 font-black text-[#185FA5]">{value}</p>
    </div>
  )
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-md bg-white/10 p-4">
      <p className="text-2xl font-black text-white">{value}</p>
      <p className="mt-1 text-xs font-bold uppercase tracking-[0.12em] text-blue-100">{label}</p>
    </div>
  )
}

function BandPill({ band }: { band: MatchBand }) {
  return <span className={`inline-flex rounded-md px-2.5 py-1 text-xs font-black uppercase tracking-[0.1em] ring-1 ${bandClasses(band)}`}>{bandLabel(band)}</span>
}

function SafetyPill({ label }: { label: 'SAFE' | 'MODERATE' | 'REACH' }) {
  const classes = label === 'SAFE' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : label === 'MODERATE' ? 'bg-orange-50 text-orange-700 ring-orange-200' : 'bg-rose-50 text-rose-700 ring-rose-200'
  return <span className={`rounded-md px-2 py-1 text-xs font-black ring-1 ${classes}`}>{label}</span>
}

function EmptyState({ title, text, compact = false }: { title: string; text: string; compact?: boolean }) {
  return (
    <div className={`rounded-md border border-dashed border-slate-300 bg-white text-center ${compact ? 'p-6' : 'p-10'}`}>
      <Building2 className="mx-auto size-10 text-slate-300" />
      <h2 className="mt-4 text-xl font-black text-[#185FA5]">{title}</h2>
      <p className="mt-2 font-semibold leading-7 text-slate-600">{text}</p>
    </div>
  )
}

function hasPremiumAccess() {
  // Unlock all premium features (Recommendations, My CAP List, etc.) for all plans (including Explorer)
  return true
}

function formatCurrency(value: number | null) {
  if (value === null || Number.isNaN(value)) return 'Not listed'
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value)
}

function feeForCategory(college: College, category: Category) {
  if (category === 'OBC' || category === 'VJ' || category === 'NT' || category === 'NT1' || category === 'NT2' || category === 'NT3') return college.fees_obc ?? college.fees_general
  if (category === 'SC') return college.fees_sc ?? college.fees_general
  if (category === 'ST') return college.fees_st ?? college.fees_general
  return college.fees_general
}

function normalizedCategory(student: Student): Category {
  return student.category ?? 'General'
}

function cutoffRank(cutoff: Cutoff | null | undefined) {
  return cutoff?.rank_cutoff ?? cutoff?.closing_rank ?? null
}

function latestCutoff(cutoffs: Cutoff[], collegeId: string, branch: string, category: Category) {
  return cutoffs
    .filter((cutoff) => cutoff.college_id === collegeId && cutoff.branch === branch && cutoff.category === category)
    .sort((a, b) => b.year - a.year || a.round.localeCompare(b.round))[0] ?? null
}

function matchBand(studentRank: number, cutoff: number | null): MatchBand {
  if (!cutoff) return 'reach'
  if (cutoff >= studentRank) return 'safe'
  if (cutoff >= studentRank * 0.8) return 'moderate'
  return 'reach'
}

function bandLabel(band: MatchBand) {
  if (band === 'safe') return 'SAFE'
  if (band === 'moderate') return 'MODERATE'
  return 'REACH'
}

function bandClasses(band: MatchBand) {
  if (band === 'safe') return 'bg-emerald-50 text-emerald-700 ring-emerald-200'
  if (band === 'moderate') return 'bg-orange-50 text-orange-700 ring-orange-200'
  return 'bg-rose-50 text-rose-700 ring-rose-200'
}

function bestBranchForCollege(college: College, cutoffs: Cutoff[], category: Category, preferredBranch?: string) {
  if (preferredBranch && college.branches.includes(preferredBranch)) return preferredBranch
  return college.branches
    .map((branch) => ({ branch, cutoff: cutoffRank(latestCutoff(cutoffs, college.id, branch, category)) ?? 0 }))
    .sort((a, b) => b.cutoff - a.cutoff)[0]?.branch ?? college.branches[0] ?? 'General Engineering'
}

function enrichCollege(college: College, cutoffs: Cutoff[], student: Student, category: Category, preferredBranch?: string): EnrichedCollege {
  const branch = bestBranchForCollege(college, cutoffs, category, preferredBranch)
  const cutoff = latestCutoff(cutoffs, college.id, branch, category)
  const rank = cutoffRank(cutoff)
  return {
    college,
    branch,
    fees: feeForCategory(college, category),
    cutoff,
    cutoffRank: rank,
    band: matchBand(student.rank, rank),
  }
}

function branchName(branch: Branch) {
  return branch.name ?? branch.branch_name ?? branch.branch ?? ''
}

function PaymentPendingPage({ student, onLogout, onCheckStatus }: { student: Student; onLogout: () => Promise<void>; onCheckStatus: () => Promise<void> }) {
  const [checking, setChecking] = useState(false)
  const [message, setMessage] = useState('')

  const checkStatus = async () => {
    setChecking(true)
    setMessage('')
    try {
      await onCheckStatus()
    } catch {
      setMessage('Failed to check status. Please try again.')
    } finally {
      setChecking(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#185FA5] px-5 py-10 text-white flex items-center justify-center">
      <div className="mx-auto max-w-xl rounded-md bg-white p-6 text-slate-950 shadow-2xl sm:p-10 text-center">
        <span className="mx-auto grid size-16 place-items-center rounded-md bg-orange-100 text-orange-600">
          <Loader2 className="size-8 animate-spin" aria-hidden="true" />
        </span>
        <h1 className="mt-6 text-2xl font-black text-[#185FA5]">Payment Verification Pending</h1>
        <p className="mt-4 text-slate-600 leading-7">
          Hello <strong>{student.name}</strong>, your account is currently pending payment confirmation.
        </p>
        <p className="mt-2 text-slate-600 leading-7 text-sm">
          Please make sure you have paid the registration fee and shared the screenshot of your receipt with the admin.
        </p>
        <div className="mt-6 rounded-md bg-slate-50 p-4 text-left border border-slate-200">
          <p className="text-xs font-black uppercase tracking-[0.12em] text-[#185FA5] mb-2">Instructions</p>
          <p className="text-xs font-semibold leading-5 text-slate-600">
            UPI ID: <strong className="font-mono bg-white px-1.5 py-0.5 rounded border border-slate-300">margdarshakcontact@okaxis</strong>
          </p>
          <p className="mt-1 text-xs font-semibold leading-5 text-slate-600">
            WhatsApp Receipt: <a href="https://wa.me/917264030382" target="_blank" rel="noreferrer" className="underline font-bold text-[#185FA5]">+91 72640 30382</a>
          </p>
        </div>
        {message ? <p className="mt-4 text-sm font-bold text-red-600">{message}</p> : null}
        <div className="mt-8 flex flex-col gap-3">
          <button
            type="button"
            disabled={checking}
            onClick={checkStatus}
            className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-[#F97316] px-5 py-3.5 text-sm font-black text-white hover:bg-orange-600 disabled:opacity-50"
          >
            {checking ? <Loader2 className="size-4 animate-spin" /> : null}
            Check Verification Status
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="inline-flex w-full items-center justify-center rounded-md border border-slate-200 px-5 py-3 text-sm font-black text-slate-600 hover:bg-slate-100"
          >
            Log Out
          </button>
        </div>
      </div>
    </main>
  )
}

export default App
