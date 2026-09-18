import { createClient } from '@supabase/supabase-js'
import './styles.css'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
const app = document.querySelector('#app')

if (!supabaseUrl || !supabaseKey) {
  app.innerHTML = `
    <main class="login-page">
      <section class="login-card setup-card">
        <div class="logo"><span class="logo-mark">QC</span><div><h1>환경변수 설정 필요</h1><p>QC Team Workboard</p></div></div>
        <p>Vercel 프로젝트에 다음 환경변수 두 개를 등록해 주세요.</p>
        <code>VITE_SUPABASE_URL</code>
        <code>VITE_SUPABASE_PUBLISHABLE_KEY</code>
      </section>
    </main>`
} else {
  startApp()
}

function startApp() {
  const supabase = createClient(supabaseUrl, supabaseKey)
  const state = {
    session: null,
    profile: null,
    profiles: [],
    tasks: [],
    weekStart: mondayOf(new Date()),
    selectedDate: iso(new Date()),
    period: 'week',
    view: 'team',
    draggedTaskId: null,
    suppressClick: false,
  }

  const statusName = { plan: '예정', working: '진행 중', review: '검토 대기', delay: '지연·이슈', done: '완료' }
  const priorityName = { low: '낮음', normal: '보통', high: '긴급' }

  renderLogin()

  supabase.auth.getSession().then(({ data }) => handleSession(data.session))
  supabase.auth.onAuthStateChange((_event, session) => {
    if (session?.user?.id !== state.session?.user?.id) handleSession(session)
  })

  async function handleSession(session) {
    state.session = session
    if (!session) {
      state.profile = null
      renderLogin()
      return
    }

    app.innerHTML = '<div class="loading">사용자 정보와 일정을 불러오는 중입니다…</div>'
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single()

    if (error || !profile) {
      await supabase.auth.signOut()
      renderLogin('직원 프로필을 찾지 못했습니다. 관리자에게 계정 등록을 요청해 주세요.')
      return
    }
    if (!profile.is_active) {
      await supabase.auth.signOut()
      renderLogin('비활성화된 계정입니다. 관리자에게 문의해 주세요.')
      return
    }

    state.profile = profile
    renderWorkspace()
    await loadData()
  }

  function renderLogin(message = '') {
    app.innerHTML = `
      <main class="login-page">
        <section class="login-card">
          <div class="logo"><span class="logo-mark">QC</span><div><h1>QC Team Workboard</h1><p>제품분석1팀 · Non-GMP 업무 보조</p></div></div>
          <form id="loginForm">
            ${message ? `<div class="error">${escapeHtml(message)}</div>` : ''}
            <label for="loginEmail">회사 이메일</label>
            <input id="loginEmail" type="email" autocomplete="username" required placeholder="name@company.com" />
            <label for="loginPassword">비밀번호</label>
            <input id="loginPassword" type="password" autocomplete="current-password" required />
            <button class="primary" type="submit">로그인</button>
          </form>
          <p class="login-note">등록된 직원 계정만 이용할 수 있습니다. 공식 시험기록과 결과는 LIMS 및 관련 기록서에서 관리합니다.</p>
        </section>
      </main>`

    document.querySelector('#loginForm').onsubmit = async (event) => {
      event.preventDefault()
      const button = event.currentTarget.querySelector('button')
      button.disabled = true
      button.textContent = '로그인 중…'
      const email = document.querySelector('#loginEmail').value.trim()
      const password = document.querySelector('#loginPassword').value
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        const details = [
          error.message,
          error.code ? `code: ${error.code}` : '',
          error.status ? `HTTP ${error.status}` : '',
        ].filter(Boolean).join(' · ')
        renderLogin(`로그인 실패: ${details || '알 수 없는 인증 오류'}`)
      }
    }
  }

  function renderWorkspace() {
    const admin = state.profile.role === 'admin'
    app.innerHTML = `
      <header class="topbar">
        <div class="brand"><span class="brand-mark">QC</span><span>QC Team Workboard</span><span class="brand-sub">제품분석1팀 · Schedule</span></div>
        <div class="account"><span class="account-name">${escapeHtml(state.profile.display_name)}</span><span class="role-badge">${admin ? '관리자' : '사용자'}</span><button id="logout" class="secondary">로그아웃</button></div>
      </header>
      <main>
        <section class="heading">
          <div><h1>팀 주간 시험업무</h1><p>업무 카드를 드래그해 날짜와 담당자를 변경할 수 있습니다.</p></div>
          <div class="heading-actions"><button id="refresh" class="secondary">새로고침</button><button id="newTask" class="primary">+ 업무 등록</button></div>
        </section>
        <section class="summary">
          <div class="summary-card"><span id="totalLabel">이번 주 전체</span><strong id="totalCount">0</strong><em>건</em></div>
          <div class="summary-card"><span>진행 중</span><strong id="workingCount">0</strong><em>건</em></div>
          <div class="summary-card"><span>검토 대기</span><strong id="reviewCount">0</strong><em>건</em></div>
          <div class="summary-card"><span>지연·이슈</span><strong id="delayCount">0</strong><em>건</em></div>
          <div class="summary-card"><span>완료</span><strong id="doneCount">0</strong><em>건</em></div>
        </section>
        <section class="toolbar">
          <div class="tool-group">
            <button class="secondary" id="prevWeek">◀ 이전주</button><button class="secondary" id="today">오늘</button>
            <span class="week-label" id="weekLabel"></span><button class="secondary" id="nextWeek">다음주 ▶</button>
            <input class="date-picker" type="date" id="focusDate" />
            <button class="primary" id="dayView">선택일 보기</button><button class="secondary hidden" id="weekView">주간 보기</button>
          </div>
          <div class="tool-group">
            <div class="segmented"><button class="active" data-view="team">팀 전체</button><button data-view="mine">내 업무</button></div>
            <input class="search" id="search" placeholder="업무명·구분 검색" />
            <select class="filter" id="statusFilter"><option value="all">상태 전체</option><option value="plan">예정</option><option value="working">진행 중</option><option value="review">검토 대기</option><option value="delay">지연·이슈</option><option value="done">완료</option></select>
          </div>
        </section>
        <section class="board-wrap"><div class="board" id="board"><div class="loading">일정을 불러오는 중입니다…</div></div></section>
        <div class="legend"><span><i class="dot plan"></i>예정</span><span><i class="dot working"></i>진행 중</span><span><i class="dot review"></i>검토 대기</span><span><i class="dot delay"></i>지연·이슈</span><span><i class="dot done"></i>완료</span><span>※ 공식 시험기록은 LIMS 및 관련 기록서에서 관리</span></div>
      </main>
      <dialog id="taskDialog">
        <div class="modal-head"><h2 id="modalTitle">업무 등록</h2><button class="close" id="closeDialog" aria-label="닫기">×</button></div>
        <form class="form" id="taskForm">
          <input type="hidden" id="taskId" />
          <div class="form-grid">
            <div class="field"><label for="employee">담당자</label><select id="employee" required></select></div>
            <div class="field"><label for="date">예정일</label><input type="date" id="date" required /></div>
            <div class="field full"><label for="title">업무명</label><input id="title" maxlength="200" required placeholder="예: 시료 전처리" /></div>
            <div class="field"><label for="category">업무 구분</label><select id="category"><option>분석</option><option>문서</option><option>교육</option><option>회의</option><option>기타</option></select></div>
            <div class="field"><label for="status">진행상태</label><select id="status"><option value="plan">예정</option><option value="working">진행 중</option><option value="review">검토 대기</option><option value="delay">지연·이슈</option><option value="done">완료</option></select></div>
            <div class="field"><label for="priority">우선순위</label><select id="priority"><option value="normal">보통</option><option value="high">긴급</option><option value="low">낮음</option></select></div>
            <div class="field full"><label for="memo">비고</label><textarea id="memo" maxlength="1000" placeholder="인계사항 또는 간단한 메모"></textarea></div>
          </div>
          <div id="formError" class="error hidden"></div>
          <div class="modal-actions"><button type="button" class="danger hidden" id="deleteTask">삭제</button><div class="actions-right"><button type="button" class="secondary" id="cancelDialog">취소</button><button type="submit" class="primary">저장</button></div></div>
        </form>
      </dialog>
      <div class="toast" id="toast"></div>`

    bindWorkspaceEvents()
  }

  function bindWorkspaceEvents() {
    document.querySelector('#logout').onclick = () => supabase.auth.signOut()
    document.querySelector('#refresh').onclick = loadData
    document.querySelector('#newTask').onclick = () => openNew()
    document.querySelector('#closeDialog').onclick = closeDialog
    document.querySelector('#cancelDialog').onclick = closeDialog
    document.querySelector('#taskForm').onsubmit = saveTask
    document.querySelector('#deleteTask').onclick = deleteTask
    document.querySelector('#search').oninput = renderBoard
    document.querySelector('#statusFilter').onchange = renderBoard
    document.querySelector('#focusDate').value = state.selectedDate
    document.querySelector('#focusDate').onchange = (event) => { state.selectedDate = event.target.value || iso(new Date()) }
    document.querySelector('#prevWeek').onclick = async () => {
      if (state.period === 'day') state.selectedDate = iso(addDays(new Date(`${state.selectedDate}T12:00:00`), -1))
      else state.weekStart = addDays(state.weekStart, -7)
      await loadTasks()
    }
    document.querySelector('#nextWeek').onclick = async () => {
      if (state.period === 'day') state.selectedDate = iso(addDays(new Date(`${state.selectedDate}T12:00:00`), 1))
      else state.weekStart = addDays(state.weekStart, 7)
      await loadTasks()
    }
    document.querySelector('#today').onclick = async () => {
      state.weekStart = mondayOf(new Date())
      state.selectedDate = iso(new Date())
      await loadTasks()
    }
    document.querySelector('#dayView').onclick = async () => {
      state.selectedDate = document.querySelector('#focusDate').value || state.selectedDate
      state.period = 'day'
      await loadTasks()
    }
    document.querySelector('#weekView').onclick = async () => {
      state.weekStart = mondayOf(new Date(`${state.selectedDate}T12:00:00`))
      state.period = 'week'
      await loadTasks()
    }
    document.querySelectorAll('[data-view]').forEach((button) => {
      button.onclick = () => {
        document.querySelectorAll('[data-view]').forEach((item) => item.classList.remove('active'))
        button.classList.add('active')
        state.view = button.dataset.view
        renderBoard()
      }
    })
  }

  async function loadData() {
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('is_active', true)
      .order('display_order')
      .order('display_name')
    if (error) return toast('직원 목록을 불러오지 못했습니다.')
    state.profiles = profiles
    fillEmployeeOptions()
    await loadTasks()
  }

  async function loadTasks() {
    const [start, end] = currentRange()
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .gte('scheduled_date', start)
      .lte('scheduled_date', end)
      .order('scheduled_date')
      .order('created_at')
    if (error) {
      toast('일정을 불러오지 못했습니다.')
      return
    }
    state.tasks = data
    renderBoard()
  }

  function fillEmployeeOptions() {
    const options = state.profile.role === 'admin'
      ? state.profiles
      : state.profiles.filter((profile) => profile.id === state.profile.id)
    document.querySelector('#employee').innerHTML = options
      .map((profile) => `<option value="${profile.id}">${escapeHtml(profile.display_name)}</option>`)
      .join('')
  }

  function renderBoard() {
    const board = document.querySelector('#board')
    if (!board) return
    const days = state.period === 'day'
      ? [new Date(`${state.selectedDate}T12:00:00`)]
      : [0, 1, 2, 3, 4].map((offset) => addDays(state.weekStart, offset))
    const [start, end] = currentRange()
    const query = document.querySelector('#search').value.trim().toLowerCase()
    const status = document.querySelector('#statusFilter').value
    const profiles = state.view === 'mine'
      ? state.profiles.filter((profile) => profile.id === state.profile.id)
      : state.profiles
    const filtered = state.tasks.filter((task) =>
      task.scheduled_date >= start &&
      task.scheduled_date <= end &&
      (status === 'all' || task.status === status) &&
      (!query || `${task.title} ${task.category}`.toLowerCase().includes(query))
    )
    const today = iso(new Date())

    document.querySelector('#weekLabel').textContent = state.period === 'day'
      ? `${formatDate(days[0])} 업무`
      : `${start} ~ ${end}`
    document.querySelector('#totalLabel').textContent = state.period === 'day' ? '선택일 전체' : '이번 주 전체'
    document.querySelector('#prevWeek').textContent = state.period === 'day' ? '◀ 전날' : '◀ 이전주'
    document.querySelector('#nextWeek').textContent = state.period === 'day' ? '다음날 ▶' : '다음주 ▶'
    document.querySelector('#focusDate').value = state.selectedDate
    document.querySelector('#dayView').classList.toggle('hidden', state.period === 'day')
    document.querySelector('#weekView').classList.toggle('hidden', state.period !== 'day')
    board.style.gridTemplateColumns = state.period === 'day' ? '175px minmax(380px, 1fr)' : '175px repeat(5, minmax(190px, 1fr))'
    board.style.minWidth = state.period === 'day' ? '580px' : '1125px'

    board.innerHTML = '<div class="cell head"><b>담당자</b><small>업무량</small></div>' +
      days.map((day) => `<div class="cell head ${iso(day) === today ? 'today-col' : ''}"><b>${dayName(day)}${iso(day) === today ? '<span class="today-badge">오늘</span>' : ''}</b><small>${day.getMonth() + 1}월 ${day.getDate()}일</small></div>`).join('')

    profiles.forEach((profile, rowIndex) => {
      const rowClass = rowIndex % 2 ? 'row-alt' : ''
      const profileTasks = filtered.filter((task) => task.assignee_id === profile.id)
      const load = Math.min(100, profileTasks.length * 18)
      board.insertAdjacentHTML('beforeend', `
        <div class="cell person ${rowClass}">
          <strong>${escapeHtml(profile.display_name)}</strong>
          <span>${profile.role === 'admin' ? '관리자' : '사용자'} · ${profileTasks.length}건</span>
          <div class="load"><i style="width:${load}%"></i></div>
        </div>`)

      days.forEach((day) => {
        const date = iso(day)
        const order = { delay: 0, working: 1, review: 2, plan: 3, done: 4 }
        const dayTasks = profileTasks
          .filter((task) => task.scheduled_date === date)
          .sort((a, b) => order[a.status] - order[b.status] || a.title.localeCompare(b.title, 'ko'))
        const canAdd = state.profile.role === 'admin' || profile.id === state.profile.id
        board.insertAdjacentHTML('beforeend', `
          <div class="cell ${rowClass} ${date === today ? 'today-col' : ''}" data-employee="${profile.id}" data-date="${date}">
            ${dayTasks.map(taskHtml).join('')}
            ${canAdd ? '<button class="empty-add" data-add="1">+ 업무</button>' : ''}
          </div>`)
      })
    })

    updateSummary(filtered)
    bindBoardEvents()
  }

  function taskHtml(task) {
    const editable = canModify(task)
    return `<article class="task ${task.status}" data-id="${task.id}" tabindex="0" draggable="${editable}">
      <strong>${escapeHtml(task.title)}</strong>
      <div class="task-meta"><span class="chip">${statusName[task.status]}</span><span>${escapeHtml(task.category)}</span>${task.priority === 'high' ? '<span class="chip">긴급</span>' : ''}</div>
    </article>`
  }

  function bindBoardEvents() {
    const board = document.querySelector('#board')
    board.querySelectorAll('.task').forEach((element) => {
      element.onclick = () => { if (!state.suppressClick) openTask(element.dataset.id) }
      if (element.getAttribute('draggable') !== 'true') return
      element.ondragstart = (event) => {
        state.draggedTaskId = element.dataset.id
        state.suppressClick = true
        event.dataTransfer.effectAllowed = 'move'
        event.dataTransfer.setData('text/plain', state.draggedTaskId)
        requestAnimationFrame(() => element.classList.add('dragging'))
      }
      element.ondragend = () => {
        state.draggedTaskId = null
        element.classList.remove('dragging')
        board.querySelectorAll('.drop-target').forEach((cell) => cell.classList.remove('drop-target'))
        setTimeout(() => { state.suppressClick = false }, 80)
      }
    })

    board.querySelectorAll('.cell[data-date]').forEach((cell) => {
      const allowed = state.profile.role === 'admin' || cell.dataset.employee === state.profile.id
      if (!allowed) return
      cell.ondragover = (event) => { event.preventDefault(); cell.classList.add('drop-target') }
      cell.ondragleave = (event) => { if (!cell.contains(event.relatedTarget)) cell.classList.remove('drop-target') }
      cell.ondrop = async (event) => {
        event.preventDefault()
        const id = state.draggedTaskId || event.dataTransfer.getData('text/plain')
        const task = state.tasks.find((item) => item.id === id)
        if (!task || !canModify(task)) return
        const { error } = await supabase.from('tasks').update({
          scheduled_date: cell.dataset.date,
          assignee_id: cell.dataset.employee,
        }).eq('id', id)
        if (error) toast('일정을 이동하지 못했습니다.')
        else { toast('일정을 이동했습니다.'); await loadTasks() }
      }
    })

    board.querySelectorAll('[data-add]').forEach((button) => {
      button.onclick = () => {
        const cell = button.closest('.cell')
        openNew(cell.dataset.employee, cell.dataset.date)
      }
    })
  }

  function openNew(assignee = state.profile.id, date = state.period === 'day' ? state.selectedDate : iso(state.weekStart)) {
    const dialog = document.querySelector('#taskDialog')
    document.querySelector('#taskForm').reset()
    document.querySelector('#taskId').value = ''
    document.querySelector('#employee').value = assignee
    document.querySelector('#date').value = date
    document.querySelector('#modalTitle').textContent = '업무 등록'
    document.querySelector('#deleteTask').classList.add('hidden')
    document.querySelector('#formError').classList.add('hidden')
    dialog.showModal()
  }

  function openTask(id) {
    const task = state.tasks.find((item) => item.id === id)
    if (!task) return
    if (!canModify(task)) {
      toast('조회만 가능한 일정입니다.')
      return
    }
    document.querySelector('#taskId').value = task.id
    document.querySelector('#employee').value = task.assignee_id
    document.querySelector('#date').value = task.scheduled_date
    document.querySelector('#title').value = task.title
    document.querySelector('#category').value = task.category
    document.querySelector('#status').value = task.status
    document.querySelector('#priority').value = task.priority
    document.querySelector('#memo').value = task.memo || ''
    document.querySelector('#modalTitle').textContent = '업무 수정'
    document.querySelector('#deleteTask').classList.remove('hidden')
    document.querySelector('#formError').classList.add('hidden')
    document.querySelector('#taskDialog').showModal()
  }

  async function saveTask(event) {
    event.preventDefault()
    const id = document.querySelector('#taskId').value
    const payload = {
      assignee_id: document.querySelector('#employee').value,
      scheduled_date: document.querySelector('#date').value,
      title: document.querySelector('#title').value.trim(),
      category: document.querySelector('#category').value,
      status: document.querySelector('#status').value,
      priority: document.querySelector('#priority').value,
      memo: document.querySelector('#memo').value.trim(),
    }
    const submit = event.currentTarget.querySelector('[type="submit"]')
    submit.disabled = true
    const result = id
      ? await supabase.from('tasks').update(payload).eq('id', id)
      : await supabase.from('tasks').insert({ ...payload, created_by: state.profile.id })
    submit.disabled = false
    if (result.error) {
      const error = document.querySelector('#formError')
      error.textContent = '저장 권한 또는 입력내용을 확인해 주세요.'
      error.classList.remove('hidden')
      return
    }
    closeDialog()
    toast(id ? '업무를 수정했습니다.' : '업무를 등록했습니다.')
    await loadTasks()
  }

  async function deleteTask() {
    const id = document.querySelector('#taskId').value
    if (!id || !confirm('이 업무를 삭제할까요?')) return
    const { error } = await supabase.from('tasks').delete().eq('id', id)
    if (error) return toast('업무를 삭제하지 못했습니다.')
    closeDialog()
    toast('업무를 삭제했습니다.')
    await loadTasks()
  }

  function closeDialog() {
    document.querySelector('#taskDialog').close()
  }

  function canModify(task) {
    return state.profile.role === 'admin' ||
      task.created_by === state.profile.id ||
      task.assignee_id === state.profile.id
  }

  function currentRange() {
    if (state.period === 'day') return [state.selectedDate, state.selectedDate]
    return [iso(state.weekStart), iso(addDays(state.weekStart, 4))]
  }

  function updateSummary(tasks) {
    document.querySelector('#totalCount').textContent = tasks.length
    ;['working', 'review', 'delay', 'done'].forEach((status) => {
      document.querySelector(`#${status}Count`).textContent = tasks.filter((task) => task.status === status).length
    })
  }

  function toast(message) {
    const element = document.querySelector('#toast')
    if (!element) return
    element.textContent = message
    element.classList.add('show')
    setTimeout(() => element.classList.remove('show'), 1900)
  }
}

function mondayOf(date) {
  const result = new Date(date)
  const day = result.getDay() || 7
  result.setHours(12, 0, 0, 0)
  result.setDate(result.getDate() - day + 1)
  return result
}

function addDays(date, number) {
  const result = new Date(date)
  result.setDate(result.getDate() + number)
  return result
}

function iso(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatDate(date) {
  return `${date.getMonth() + 1}/${date.getDate()} (${['일', '월', '화', '수', '목', '금', '토'][date.getDay()]})`
}

function dayName(date) {
  return ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'][date.getDay()]
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character])
}
