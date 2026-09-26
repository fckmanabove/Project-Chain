"""
Производственный календарь для CPM Engine.
Обработка рабочих дней, смещений и праздников.
"""

from datetime import date, timedelta
from enum import Enum
from typing import Set, Optional


class WorkWeekType(str, Enum):
    FIVE_DAYS = "5/2"    # Суббота и воскресенье — выходные
    SIX_DAYS = "6/1"     # Воскресенье — выходной
    SEVEN_DAYS = "7/0"   # Без выходных (непрерывное производство)


class WorkCalendar:
    """
    Календарный калькулятор для расчета длительностей и дат задач.
    """

    def __init__(
        self,
        week_type: WorkWeekType = WorkWeekType.FIVE_DAYS,
        holidays: Optional[Set[date]] = None,
        work_weekends: Optional[Set[date]] = None,
    ):
        """
        :param week_type: Тип рабочей недели (5/2, 6/1, 7/0)
        :param holidays: Множество официальных праздничных дней (нераб.)
        :param work_weekends: Перенесенные рабочие дни (субботы-рабочие)
        """
        self.week_type = week_type
        self.holidays = holidays or set()
        self.work_weekends = work_weekends or set()

    def is_working_day(self, target_date: date) -> bool:
        """
        Проверяет, является ли указанный день рабочим.
        """
        # Если день явно объявлен рабочей субботой/воскресеньем
        if target_date in self.work_weekends:
            return True

        # Если день в списке официальных праздников
        if target_date in self.holidays:
            return False

        weekday = target_date.weekday()  # 0 = Пн, 6 = Вс

        if self.week_type == WorkWeekType.FIVE_DAYS:
            return weekday < 5  # Пн-Пт
        elif self.week_type == WorkWeekType.SIX_DAYS:
            return weekday < 6  # Пн-Сб
        elif self.week_type == WorkWeekType.SEVEN_DAYS:
            return True

        return True

    def add_working_days(self, start_date: date, working_days: int) -> date:
        """
        Прибавляет (или вычитает) N рабочих дней к дате.
        
        Правило CPM: если задача стартует в понедельник и длится 1 день, 
        она завершается в этот же понедельник (start + duration - 1).
        Для смещения чистых дней: working_days = N.
        """
        if working_days == 0:
            return start_date

        step = 1 if working_days > 0 else -1
        days_to_move = abs(working_days)
        current_date = start_date

        while days_to_move > 0:
            current_date += timedelta(days=step)
            if self.is_working_day(current_date):
                days_to_move -= 1

        return current_date

    def calculate_finish_date(self, start_date: date, duration_days: int) -> date:
        """
        Вычисляет дату завершения задачи по формуле CPM:
        Если длительность 1 день, то финиш = старт (если старт рабочий).
        Если длительность N дней, финиш = старт + (N - 1) рабочих дней.
        """
        if duration_days <= 0:
            return start_date

        # Если стартовый день выпал на выходной, сдвигаем на ближайший рабочий
        current_date = start_date
        while not self.is_working_day(current_date):
            current_date += timedelta(days=1)

        if duration_days == 1:
            return current_date

        return self.add_working_days(current_date, duration_days - 1)

    def working_days_between(self, start_date: date, finish_date: date) -> int:
        """
        Считает количество рабочих дней между двумя датами включительно.
        """
        if start_date > finish_date:
            return -self.working_days_between(finish_date, start_date)

        days_count = 0
        current_date = start_date
        while current_date <= finish_date:
            if self.is_working_day(current_date):
                days_count += 1
            current_date += timedelta(days=1)

        return days_count