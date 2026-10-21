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
    adminProfiles: [],
    tasks: [],
    personTasks: [],
    personRoutines: [],
    routineLoadError: false,
    personTaskProfileId: null,
    personTaskRequestId: 0,
    completedCount: 0,
    completedExpanded: false,
    completedLoading: false,
    completedLoadError: false,
    reopenPersonTasks: false,
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
      renderLogin('사용이 중지된 계정입니다. 관리자에게 문의해 주세요.')
      return
    }

    state.profile = profile
    renderWorkspace()
    await loadData()
  }

  function renderLogin(message = '', mode = 'login') {
    const signup = mode === 'signup'
    app.innerHTML = `
      <main class="login-page">
        <section class="login-card">
          <div class="logo"><span class="logo-mark">QC</span><div><h1>QC Team Workboard</h1><p>제품분석1팀 · Non-GMP 업무 보조</p></div></div>
          <div class="auth-tabs"><button id="showLogin" class="${signup ? '' : 'active'}" type="button">로그인</button><button id="showSignup" class="${signup ? 'active' : ''}" type="button">회원가입</button></div>
          <form id="${signup ? 'signupForm' : 'loginForm'}">
            ${message ? `<div class="error">${escapeHtml(message)}</div>` : ''}
            ${signup ? `
              <label for="signupName">한글 이름</label>
              <input id="signupName" maxlength="20" autocomplete="name" required placeholder="예: 이성철" />
              <label for="signupEmail">로그인 ID (회사 이메일)</label>
              <input id="signupEmail" type="email" autocomplete="username" required placeholder="name@ysls.co.kr" />
              <label for="signupPassword">비밀번호</label>
              <input id="signupPassword" type="password" minlength="8" autocomplete="new-password" required placeholder="8자 이상" />
              <label for="signupPasswordConfirm">비밀번호 확인</label>
              <input id="signupPasswordConfirm" type="password" minlength="8" autocomplete="new-password" required />
              <button class="primary" type="submit">가입 신청</button>
            ` : `
              <label for="loginEmail">로그인 ID (회사 이메일)</label>
              <input id="loginEmail" type="email" autocomplete="username" required placeholder="name@ysls.co.kr" />
              <label for="loginPassword">비밀번호</label>
              <input id="loginPassword" type="password" autocomplete="current-password" required />
              <button class="primary" type="submit">로그인</button>
            `}
          </form>
          <p class="login-note">${signup ? '회사 이메일로 가입하면 즉시 이용할 수 있습니다.' : '등록된 직원 계정만 이용할 수 있습니다.'} 공식 시험기록과 결과는 LIMS 및 관련 기록서에서 관리합니다.</p>
        </section>
      </main>`

    document.querySelector('#showLogin').onclick = () => renderLogin('', 'login')
    document.querySelector('#showSignup').onclick = () => renderLogin('', 'signup')
    if (signup) {
      document.querySelector('#signupForm').onsubmit = submitSignup
      return
    }

    document.querySelector('#loginForm').onsubmit = async (event) => {
      event.preventDefault()
      const button = event.currentTarget.querySelector('button')
      button.disabled = true
      button.textContent = '로그인 중…'
      const email = document.querySelector('#loginEmail').value.trim()
      const password = document.querySelector('#loginPassword').value
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        renderLogin('이메일 또는 비밀번호를 확인해 주세요.')
      }
    }
  }

  async function submitSignup(event) {
    event.preventDefault()
    const name = document.querySelector('#signupName').value.trim()
    const email = document.querySelector('#signupEmail').value.trim().toLowerCase()
    const password = document.querySelector('#signupPassword').value
    const confirmPassword = document.querySelector('#signupPasswordConfirm').value
    if (!/^[가-힣]{2,10}$/.test(name)) return renderLogin('한글 이름을 2~10자로 입력해 주세요.', 'signup')
    if (!email.endsWith('@ysls.co.kr')) return renderLogin('회사 이메일(@ysls.co.kr)만 가입할 수 있습니다.', 'signup')
    if (password.length < 8) return renderLogin('비밀번호는 8자 이상이어야 합니다.', 'signup')
    if (password !== confirmPassword) return renderLogin('비밀번호 확인이 일치하지 않습니다.', 'signup')

    const button = event.currentTarget.querySelector('[type="submit"]')
    button.disabled = true
    button.textContent = '가입 신청 중…'
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: name } },
    })
    if (error) {
      const duplicate = /already|registered|exists/i.test(error.message)
      renderLogin(duplicate ? '이미 가입된 이메일입니다.' : '가입 신청에 실패했습니다. 입력 내용을 확인해 주세요.', 'signup')
      return
    }
    if (data.session) {
      await handleSession(data.session)
      return
    }
    renderLogin('회원가입이 완료되었습니다. 이메일 확인 후 로그인해 주세요.')
  }

  function renderWorkspace() {
    const admin = state.profile.role === 'admin'
    app.innerHTML = `
      <header class="topbar">
        <div class="brand"><span class="brand-mark">QC</span><span>QC Team Workboard</span><span class="brand-sub">제품분석1팀 · Schedule</span></div>
        <div class="account"><span class="account-name">${escapeHtml(state.profile.display_name)} <small>${escapeHtml(state.profile.email)}</small></span><span class="role-badge">${admin ? '관리자' : '사용자'}</span>${admin ? '<button id="manageUsers" class="secondary">사용자 관리</button>' : ''}<button id="logout" class="secondary">로그아웃</button></div>
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
            <div class="field"><label for="date">예정일 <small>비워두면 업무 보관함에 저장</small></label><input type="date" id="date" /></div>
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
      <dialog id="personTasksDialog" class="person-tasks-dialog">
        <div class="modal-head"><div><h2 id="personTasksTitle">담당자 전체 업무</h2><p>매일 루틴 업무, 날짜 미정 업무와 일정에 배정된 업무를 함께 확인합니다.</p></div><button class="close" id="closePersonTasks" aria-label="닫기">×</button></div>
        <div class="person-tasks-toolbar">
          <div class="person-task-counts" id="personTaskCounts"></div>
          <div class="person-task-actions"><button class="secondary hidden" id="newRoutine">+ 매일 루틴 등록</button><button class="primary hidden" id="newBacklogTask">+ 날짜 미정 업무 등록</button></div>
        </div>
        <div class="person-tasks-body" id="personTasksBody"><div class="loading">전체 업무를 불러오는 중입니다…</div></div>
      </dialog>
      <dialog id="routineDialog">
        <div class="modal-head"><h2 id="routineDialogTitle">매일 루틴 등록</h2><button class="close" id="closeRoutine" aria-label="닫기">×</button></div>
        <form class="form" id="routineForm">
          <input type="hidden" id="routineId" />
          <div class="field"><label for="routineTitle">업무명</label><input id="routineTitle" maxlength="200" required placeholder="예: 매일 장비 상태 확인" /></div>
          <div class="field routine-details"><label for="routineDetails">업무 내용</label><textarea id="routineDetails" maxlength="2000" placeholder="반복해서 수행할 내용을 적어 주세요."></textarea></div>
          <div id="routineError" class="error hidden"></div>
          <div class="modal-actions"><button type="button" class="danger hidden" id="deleteRoutine">삭제</button><div class="actions-right"><button type="button" class="secondary" id="cancelRoutine">취소</button><button type="submit" class="primary">저장</button></div></div>
        </form>
      </dialog>
      ${admin ? `<dialog id="userDialog" class="user-dialog">
        <div class="modal-head"><div><h2>사용자 관리</h2><p>한글 이름, 권한, 사용 상태와 일정표 표시 순서를 관리합니다.</p></div><button class="close" id="closeUsers" aria-label="닫기">×</button></div>
        <div class="user-admin-body"><div id="userAdminList" class="user-admin-list"><div class="loading">사용자 목록을 불러오는 중입니다…</div></div></div>
      </dialog>` : ''}
      <div class="toast" id="toast"></div>`

    bindWorkspaceEvents()
  }

  function bindWorkspaceEvents() {
    document.querySelector('#logout').onclick = () => supabase.auth.signOut()
    document.querySelector('#refresh').onclick = loadData
    document.querySelector('#newTask').onclick = () => openNew()
    document.querySelector('#closeDialog').onclick = () => closeDialog()
    document.querySelector('#cancelDialog').onclick = () => closeDialog()
    document.querySelector('#taskForm').onsubmit = saveTask
    document.querySelector('#deleteTask').onclick = deleteTask
    document.querySelector('#closePersonTasks').onclick = () => document.querySelector('#personTasksDialog').close()
    document.querySelector('#newRoutine').onclick = () => openRoutine()
    document.querySelector('#closeRoutine').onclick = closeRoutineDialog
    document.querySelector('#cancelRoutine').onclick = closeRoutineDialog
    document.querySelector('#routineDialog').oncancel = (event) => { event.preventDefault(); closeRoutineDialog() }
    document.querySelector('#routineForm').onsubmit = saveRoutine
    document.querySelector('#deleteRoutine').onclick = deleteRoutine
    document.querySelector('#newBacklogTask').onclick = () => {
      const profileId = state.personTaskProfileId
      state.reopenPersonTasks = true
      document.querySelector('#personTasksDialog').close()
      openNew(profileId, '')
    }
    if (state.profile.role === 'admin') {
      document.querySelector('#manageUsers').onclick = openUserManager
      document.querySelector('#closeUsers').onclick = () => document.querySelector('#userDialog').close()
    }
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

  async function openUserManager() {
    document.querySelector('#userDialog').showModal()
    await refreshUserManager()
  }

  async function refreshUserManager() {
    const { data, error } = await supabase.from('profiles').select('*').order('display_order').order('display_name')
    if (error) {
      document.querySelector('#userAdminList').innerHTML = '<div class="error">사용자 목록을 불러오지 못했습니다.</div>'
      return
    }
    state.adminProfiles = data
    renderUserManager()
  }

  function renderUserManager() {
    const list = document.querySelector('#userAdminList')
    list.innerHTML = `
      <div class="user-row user-row-head"><span>순서</span><span>한글 이름 / 로그인 ID</span><span>권한</span><span>상태</span><span>저장</span></div>
      ${state.adminProfiles.map((profile, index) => `
        <div class="user-row" data-user-id="${profile.id}">
          <div class="order-buttons"><button class="secondary" data-move="up" ${index === 0 ? 'disabled' : ''} aria-label="위로">▲</button><button class="secondary" data-move="down" ${index === state.adminProfiles.length - 1 ? 'disabled' : ''} aria-label="아래로">▼</button></div>
          <div><input class="user-name-input" maxlength="20" value="${escapeHtml(profile.display_name)}" aria-label="한글 이름" /><small>${escapeHtml(profile.email)}</small></div>
          <select class="user-role" ${profile.id === state.profile.id ? 'disabled' : ''}><option value="user" ${profile.role === 'user' ? 'selected' : ''}>사용자</option><option value="admin" ${profile.role === 'admin' ? 'selected' : ''}>관리자</option></select>
          <label class="active-toggle"><input class="user-active" type="checkbox" ${profile.is_active ? 'checked' : ''} ${profile.id === state.profile.id ? 'disabled' : ''} /><span>${profile.is_active ? '사용 중' : '사용 중지'}</span></label>
          <button class="primary" data-save-user>저장</button>
        </div>`).join('')}`

    list.querySelectorAll('[data-move]').forEach((button) => {
      button.onclick = () => moveUser(button.closest('.user-row').dataset.userId, button.dataset.move)
    })
    list.querySelectorAll('[data-save-user]').forEach((button) => {
      button.onclick = () => saveUser(button.closest('.user-row'))
    })
    list.querySelectorAll('.user-active').forEach((input) => {
      input.onchange = () => { input.nextElementSibling.textContent = input.checked ? '사용 중' : '사용 중지' }
    })
  }

  async function saveUser(row) {
    const id = row.dataset.userId
    const name = row.querySelector('.user-name-input').value.trim()
    if (!/^[가-힣]{2,10}$/.test(name)) return toast('한글 이름을 2~10자로 입력해 주세요.')
    const payload = {
      display_name: name,
      role: row.querySelector('.user-role').value,
      is_active: row.querySelector('.user-active').checked,
    }
    const button = row.querySelector('[data-save-user]')
    button.disabled = true
    const { error } = await supabase.from('profiles').update(payload).eq('id', id)
    button.disabled = false
    if (error) return toast('사용자 정보를 저장하지 못했습니다.')
    toast('사용자 정보를 저장했습니다.')
    await loadData()
    await refreshUserManager()
  }

  async function moveUser(id, direction) {
    const index = state.adminProfiles.findIndex((profile) => profile.id === id)
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (index < 0 || targetIndex < 0 || targetIndex >= state.adminProfiles.length) return
    const reordered = [...state.adminProfiles]
    ;[reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]]
    const results = await Promise.all(reordered.map((profile, order) =>
      supabase.from('profiles').update({ display_order: order + 1 }).eq('id', profile.id)
    ))
    if (results.some((result) => result.error)) return toast('표시 순서를 저장하지 못했습니다.')
    state.adminProfiles = reordered.map((profile, order) => ({ ...profile, display_order: order + 1 }))
    renderUserManager()
    await loadData()
    toast('표시 순서를 변경했습니다.')
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
          <button type="button" class="person-name" data-person-tasks="${profile.id}">${escapeHtml(profile.display_name)}</button>
          <span>${profile.role === 'admin' ? '관리자' : '사용자'} · ${profileTasks.length}건</span>
          <small class="person-hint">전체 업무 보기 ›</small>
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
    board.querySelectorAll('[data-person-tasks]').forEach((button) => {
      button.onclick = () => openPersonTasks(button.dataset.personTasks)
    })
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

  async function openPersonTasks(profileId, keepCompletedOpen = false) {
    const profile = state.profiles.find((item) => item.id === profileId)
    if (!profile) return
    const requestId = ++state.personTaskRequestId
    state.personTaskProfileId = profileId
    state.personTasks = []
    state.personRoutines = []
    state.routineLoadError = false
    state.completedCount = 0
    state.completedExpanded = keepCompletedOpen
    state.completedLoading = false
    state.completedLoadError = false
    const dialog = document.querySelector('#personTasksDialog')
    document.querySelector('#personTasksTitle').textContent = `${profile.display_name}님의 전체 업무`
    document.querySelector('#personTasksBody').innerHTML = '<div class="loading">전체 업무를 불러오는 중입니다…</div>'
    document.querySelector('#personTaskCounts').innerHTML = ''
    const canAdd = state.profile.role === 'admin' || profileId === state.profile.id
    document.querySelector('#newRoutine').classList.toggle('hidden', !canAdd)
    document.querySelector('#newBacklogTask').classList.toggle('hidden', !canAdd)
    if (!dialog.open) dialog.showModal()

    const completedCountRequest = supabase.from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('assignee_id', profileId)
      .eq('status', 'done')
    const activeTasks = []
    let activeError = null
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await supabase.from('tasks')
        .select('*')
        .eq('assignee_id', profileId)
        .neq('status', 'done')
        .order('updated_at', { ascending: false })
        .order('id', { ascending: false })
        .range(offset, offset + 499)
      if (requestId !== state.personTaskRequestId) return
      if (error) { activeError = error; break }
      activeTasks.push(...data)
      if (data.length < 500) break
    }
    const { count, error: countError } = await completedCountRequest
    if (requestId !== state.personTaskRequestId) return
    if (activeError || countError) {
      document.querySelector('#personTasksBody').innerHTML = '<div class="error">전체 업무를 불러오지 못했습니다.</div>'
      return
    }
    state.personTasks = activeTasks
    state.completedCount = count || 0
    const { data: routines, error: routineError } = await supabase.from('daily_routines')
      .select('*')
      .eq('assignee_id', profileId)
      .order('created_at')
      .order('id')
    if (requestId !== state.personTaskRequestId) return
    state.personRoutines = routines || []
    state.routineLoadError = !!routineError
    renderPersonTasks()
    if (state.completedExpanded && state.completedCount) await loadCompletedTasks()
  }

  async function loadCompletedTasks() {
    if (state.completedLoading || !state.completedExpanded) return
    const requestId = state.personTaskRequestId
    const offset = state.personTasks.filter((task) => task.status === 'done').length
    if (offset >= state.completedCount) return
    state.completedLoading = true
    state.completedLoadError = false
    renderPersonTasks()
    const { data, error } = await supabase.from('tasks')
      .select('*')
      .eq('assignee_id', state.personTaskProfileId)
      .eq('status', 'done')
      .order('updated_at', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, offset + 19)
    if (requestId !== state.personTaskRequestId) return
    state.completedLoading = false
    if (error) {
      state.completedLoadError = true
      toast('완료 업무를 불러오지 못했습니다.')
    } else {
      state.personTasks.push(...data)
    }
    renderPersonTasks()
  }

  function renderPersonTasks() {
    const unscheduled = state.personTasks.filter((task) => !task.scheduled_date && task.status !== 'done')
    const scheduled = state.personTasks
      .filter((task) => task.scheduled_date && task.status !== 'done')
      .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date))
    const completed = state.personTasks.filter((task) => task.status === 'done')
    document.querySelector('#personTaskCounts').innerHTML = `
      <span><b>${state.personRoutines.length}</b> 매일 루틴</span>
      <span><b>${unscheduled.length}</b> 날짜 미정</span>
      <span><b>${scheduled.length}</b> 일정 배정</span>
      <span><b>${state.completedCount}</b> 완료</span>`
    document.querySelector('#personTasksBody').innerHTML = [
      `<section class="person-task-section">
        <div class="person-task-section-head"><div><h3>매일 루틴 업무</h3><p>날짜와 관계없이 매일 수행할 내용을 기록합니다.</p></div><span>${state.personRoutines.length}건</span></div>
        <div class="person-task-list">${state.routineLoadError ? '<div class="person-task-empty">루틴 업무를 불러오지 못했습니다. 데이터베이스 설정을 확인해 주세요.</div>' : state.personRoutines.length ? state.personRoutines.map(routineHtml).join('') : '<div class="person-task-empty">등록된 매일 루틴 업무가 없습니다.</div>'}</div>
      </section>`,
      personTaskSection('날짜 미정 업무', '주간 일정에 아직 배정하지 않은 업무입니다.', unscheduled, '보관된 업무가 없습니다.'),
      personTaskSection('일정 배정 업무', '예정일이 지정되어 주간업무에 표시되는 업무입니다.', scheduled, '배정된 업무가 없습니다.'),
      `<section class="person-task-section">
        <div class="person-task-section-head">
          <div><button type="button" id="toggleCompleted" class="completed-toggle" aria-expanded="${state.completedExpanded}">${state.completedExpanded ? '▾' : '▸'} 완료 업무</button><p>필요할 때 최근 변경된 업무부터 20건씩 확인합니다.</p></div>
          <span>${state.completedCount}건</span>
        </div>
        ${state.completedExpanded ? `<div class="person-task-list">
          ${completed.length ? completed.map(personTaskHtml).join('') : state.completedLoading ? '<div class="person-task-empty">불러오는 중…</div>' : state.completedLoadError ? '<div class="person-task-empty">완료 업무를 불러오지 못했습니다. 다시 시도해 주세요.</div>' : state.completedCount ? '' : '<div class="person-task-empty">완료된 업무가 없습니다.</div>'}
          ${completed.length < state.completedCount ? `<button type="button" id="moreCompleted" class="secondary person-task-more" ${state.completedLoading ? 'disabled' : ''}>${state.completedLoading ? '불러오는 중…' : state.completedLoadError ? '다시 시도' : `더 보기 (${completed.length} / ${state.completedCount})`}</button>` : ''}
        </div>` : ''}
      </section>`,
    ].join('')
    document.querySelector('#toggleCompleted').onclick = () => {
      state.completedExpanded = !state.completedExpanded
      renderPersonTasks()
      if (state.completedExpanded && !completed.length) loadCompletedTasks()
    }
    const moreCompleted = document.querySelector('#moreCompleted')
    if (moreCompleted) moreCompleted.onclick = loadCompletedTasks
    document.querySelectorAll('[data-routine-id]').forEach((element) => {
      element.onclick = () => openRoutine(element.dataset.routineId)
      element.onkeydown = (event) => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openRoutine(element.dataset.routineId) }
      }
    })
    document.querySelectorAll('[data-person-task-id]').forEach((element) => {
      element.onclick = () => openTask(element.dataset.personTaskId, true)
      element.onkeydown = (event) => {
        if (event.key === 'Enter' || event.key === ' ') openTask(element.dataset.personTaskId, true)
      }
    })
  }

  function personTaskSection(title, description, tasks, emptyText) {
    return `<section class="person-task-section">
      <div class="person-task-section-head"><div><h3>${title}</h3><p>${description}</p></div><span>${tasks.length}건</span></div>
      <div class="person-task-list">${tasks.length ? tasks.map(personTaskHtml).join('') : `<div class="person-task-empty">${emptyText}</div>`}</div>
    </section>`
  }

  function personTaskHtml(task) {
    const dateLabel = task.scheduled_date ? formatIsoDate(task.scheduled_date) : '날짜 미정'
    return `<article class="person-task-item ${task.status}" data-person-task-id="${task.id}" tabindex="0">
      <div class="person-task-main"><strong>${escapeHtml(task.title)}</strong><p>${escapeHtml(task.memo || '메모 없음')}</p></div>
      <div class="person-task-details"><span class="person-task-date ${task.scheduled_date ? '' : 'unscheduled'}">${dateLabel}</span><span class="chip">${statusName[task.status]}</span><span>${escapeHtml(task.category)}</span>${task.priority === 'high' ? '<span class="chip urgent">긴급</span>' : ''}</div>
    </article>`
  }

  function routineHtml(routine) {
    return `<article class="person-task-item routine-item" data-routine-id="${routine.id}" tabindex="0">
      <div class="person-task-main"><strong>${escapeHtml(routine.title)}</strong><p>${escapeHtml(routine.details || '업무 내용 없음')}</p></div>
      <div class="person-task-details"><span class="chip">매일 반복</span></div>
    </article>`
  }

  function openRoutine(id = '') {
    const routine = id ? state.personRoutines.find((item) => item.id === id) : null
    if (id && !routine) return
    const editable = !routine || canModify(routine)
    document.querySelector('#routineForm').reset()
    document.querySelector('#routineId').value = routine?.id || ''
    document.querySelector('#routineTitle').value = routine?.title || ''
    document.querySelector('#routineDetails').value = routine?.details || ''
    document.querySelector('#routineDialogTitle').textContent = routine ? editable ? '매일 루틴 수정' : '매일 루틴 보기' : '매일 루틴 등록'
    document.querySelector('#deleteRoutine').classList.toggle('hidden', !routine || !editable)
    document.querySelector('#routineForm [type="submit"]').classList.toggle('hidden', !editable)
    document.querySelectorAll('#routineTitle, #routineDetails').forEach((field) => { field.disabled = !editable })
    document.querySelector('#routineError').classList.add('hidden')
    state.reopenPersonTasks = true
    document.querySelector('#personTasksDialog').close()
    document.querySelector('#routineDialog').showModal()
  }

  async function saveRoutine(event) {
    event.preventDefault()
    const id = document.querySelector('#routineId').value
    const title = document.querySelector('#routineTitle').value.trim()
    const details = document.querySelector('#routineDetails').value.trim()
    const errorElement = document.querySelector('#routineError')
    if (!title) {
      errorElement.textContent = '업무명을 입력해 주세요.'
      errorElement.classList.remove('hidden')
      return
    }
    const submit = event.currentTarget.querySelector('[type="submit"]')
    submit.disabled = true
    const result = id
      ? await supabase.from('daily_routines').update({ title, details }).eq('id', id)
      : await supabase.from('daily_routines').insert({ assignee_id: state.personTaskProfileId, title, details, created_by: state.profile.id })
    submit.disabled = false
    if (result.error) {
      errorElement.textContent = '루틴 업무를 저장하지 못했습니다. 권한 또는 데이터베이스 설정을 확인해 주세요.'
      errorElement.classList.remove('hidden')
      return
    }
    document.querySelector('#routineDialog').close()
    toast(id ? '매일 루틴 업무를 수정했습니다.' : '매일 루틴 업무를 등록했습니다.')
    state.reopenPersonTasks = false
    await openPersonTasks(state.personTaskProfileId, state.completedExpanded)
  }

  async function deleteRoutine() {
    const id = document.querySelector('#routineId').value
    if (!id || !confirm('이 매일 루틴 업무를 삭제할까요?')) return
    const { error } = await supabase.from('daily_routines').delete().eq('id', id)
    if (error) return toast('매일 루틴 업무를 삭제하지 못했습니다.')
    document.querySelector('#routineDialog').close()
    toast('매일 루틴 업무를 삭제했습니다.')
    state.reopenPersonTasks = false
    await openPersonTasks(state.personTaskProfileId, state.completedExpanded)
  }

  function closeRoutineDialog() {
    document.querySelector('#routineDialog').close()
    if (state.reopenPersonTasks && state.personTaskProfileId) {
      state.reopenPersonTasks = false
      openPersonTasks(state.personTaskProfileId, state.completedExpanded)
    }
  }

  function openNew(assignee = state.profile.id, date = state.period === 'day' ? state.selectedDate : iso(state.weekStart)) {
    const dialog = document.querySelector('#taskDialog')
    setTaskFormReadOnly(false)
    document.querySelector('#taskForm').reset()
    document.querySelector('#taskId').value = ''
    document.querySelector('#employee').value = assignee
    document.querySelector('#date').value = date
    document.querySelector('#modalTitle').textContent = '업무 등록'
    document.querySelector('#deleteTask').classList.add('hidden')
    document.querySelector('#formError').classList.add('hidden')
    dialog.showModal()
  }

  function openTask(id, fromPersonTasks = false) {
    const task = state.tasks.find((item) => item.id === id) || state.personTasks.find((item) => item.id === id)
    if (!task) return
    const editable = canModify(task)
    setTaskFormReadOnly(!editable)
    document.querySelector('#taskId').value = task.id
    document.querySelector('#employee').value = task.assignee_id
    if (fromPersonTasks) {
      state.reopenPersonTasks = true
      document.querySelector('#personTasksDialog').close()
    }
    document.querySelector('#date').value = task.scheduled_date || ''
    document.querySelector('#title').value = task.title
    document.querySelector('#category').value = task.category
    document.querySelector('#status').value = task.status
    document.querySelector('#priority').value = task.priority
    document.querySelector('#memo').value = task.memo || ''
    document.querySelector('#modalTitle').textContent = editable ? '업무 수정' : '업무 보기'
    document.querySelector('#deleteTask').classList.toggle('hidden', !editable)
    document.querySelector('#formError').classList.add('hidden')
    document.querySelector('#taskDialog').showModal()
  }

  function setTaskFormReadOnly(readOnly) {
    document.querySelectorAll('#taskForm input:not([type="hidden"]), #taskForm select, #taskForm textarea').forEach((field) => {
      field.disabled = readOnly
    })
    document.querySelector('#taskForm [type="submit"]').classList.toggle('hidden', readOnly)
  }

  async function saveTask(event) {
    event.preventDefault()
    const id = document.querySelector('#taskId').value
    const payload = {
      assignee_id: document.querySelector('#employee').value,
      scheduled_date: document.querySelector('#date').value || null,
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
    closeDialog(false)
    toast(id ? '업무를 수정했습니다.' : '업무를 등록했습니다.')
    await loadTasks()
    if (state.reopenPersonTasks && state.personTaskProfileId) {
      state.reopenPersonTasks = false
      await openPersonTasks(state.personTaskProfileId, state.completedExpanded)
    }
  }

  async function deleteTask() {
    const id = document.querySelector('#taskId').value
    if (!id || !confirm('이 업무를 삭제할까요?')) return
    const { error } = await supabase.from('tasks').delete().eq('id', id)
    if (error) return toast('업무를 삭제하지 못했습니다.')
    closeDialog(false)
    toast('업무를 삭제했습니다.')
    await loadTasks()
    if (state.reopenPersonTasks && state.personTaskProfileId) {
      state.reopenPersonTasks = false
      await openPersonTasks(state.personTaskProfileId, state.completedExpanded)
    }
  }

  function closeDialog(reopenPerson = true) {
    document.querySelector('#taskDialog').close()
    if (reopenPerson && state.reopenPersonTasks && state.personTaskProfileId) {
      state.reopenPersonTasks = false
      openPersonTasks(state.personTaskProfileId, state.completedExpanded)
    }
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

function formatIsoDate(value) {
  const date = new Date(`${value}T12:00:00`)
  return `${date.getMonth() + 1}/${date.getDate()} (${['일', '월', '화', '수', '목', '금', '토'][date.getDay()]})`
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character])
}
