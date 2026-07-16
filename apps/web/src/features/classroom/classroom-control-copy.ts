import type { ClassSession } from '@/platform/models';

export function screenControlCopy(syncState: ClassSession['studentSyncState'], followRows: number, selfStudyRows: number) {
  if (syncState === 'forced') {
    return {
      summary: '教师正在统一控制全班学生屏幕。',
      teacher: '翻页会同步投屏与所有学生端，适合关键讲评或统一观察。',
      student: '学生端暂时不能切到自主浏览，解除后可恢复个人节奏。',
    };
  }

  if (selfStudyRows > 0) {
    return {
      summary: '教师翻页同步跟随学生，不打断自主浏览学生。',
      teacher: `当前 ${followRows} 名学生跟随课堂，${selfStudyRows} 名学生自主回看。`,
      student: '自主浏览学生会保留在自己的页码，教师可在需要时拉回全班。',
    };
  }

  return {
    summary: '课堂处于普通跟随状态。',
    teacher: '普通翻页会同步投屏和学生课堂跟随端。',
    student: '学生可切换自主浏览；教师强制跟随后会锁定到当前页。',
  };
}

export function studentControlStatus(controlSource: 'teacher-forced' | 'student-self' | 'teacher-follow', teacherSlideIndex: number, displayIndex: number) {
  if (controlSource === 'teacher-forced') {
    return {
      title: '教师正在统一控制屏幕',
      summary: `当前已锁定到教师第 ${teacherSlideIndex} 页。`,
      detail: '请先完成本页观察与作答；教师解除全班跟随后，才能继续自主浏览。',
    };
  }

  if (controlSource === 'student-self') {
    return {
      title: '你正在自主浏览',
      summary: `当前停留在第 ${displayIndex} 页，教师普通翻页不会打断。`,
      detail: '如需回到课堂节奏，点击“跟随教师节奏”；教师也可在关键讲评时拉回全班。',
    };
  }

  return {
    title: '正在跟随教师讲解',
    summary: `当前跟随教师第 ${teacherSlideIndex} 页。`,
    detail: '教师翻页、播报和重点讲解会同步到课堂跟随端；你只需要完成本页小任务。',
  };
}
