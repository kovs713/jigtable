# Commands
command-start = приветственное сообщение
command-new = начать загружать картинки
command-reset = отменить текущую загрузку
command-commit = собрать текущую композицию
command-status = проверить статус загрузки
command-list = посмотреть готовые композиции

# Shared
user-not-found = не вижу пользователя, не могу начать.
button-view = глянуть
button-build = собрать
button-remove = удалить
button-remove-latest = убрать последнюю
button-remove-all = снести всё
button-remove-all-confirm = да, снести всё
button-delete = удалить
button-close = закрыть
button-back = назад
button-next = дальше
button-cancel = не надо
button-continue = дальше
button-open-editor = открыть редактор
button-yes-remove = да, удалить
button-no-cancel = нет, не надо
callback-removed = удалил
callback-deleting = удаляю...
date-missing = без даты
size-not-ready = размер ещё не готов

# Start / new / reset
start-message =
    кидай картинки.

    можно пачкой, можно по одной, можно как попало.
    я разберусь.
new-message =
    кидай картинки.

    можно пачкой, можно по одной, можно как попало.
    я разберусь.
reset-done = снёс. можешь кидать заново.
reset-nothing = нечего сбрасывать.

# Upload
upload-nothing-to-show = смотреть пока нечего.
upload-building =
    { $count ->
        [one] собираю из { $count } картинки.
        [few] собираю из { $count } картинок.
        [many] собираю из { $count } картинок.
       *[other] собираю из { $count } картинки.
    }
upload-no-active-composition = нет активной композиции. начни через /new.
upload-clear-question = точно снести весь набор?
upload-cleared = снёс. можно кидать заново.
upload-cleared-empty = всё удалил. набор пустой.
upload-status-empty =
    смотреть пока нечего.
    кинь сначала картинки.
upload-status-pictures =
    { $count ->
        [one] в наборе { $count } картинка.
        [few] в наборе { $count } картинки.
        [many] в наборе { $count } картинок.
       *[other] в наборе { $count } картинки.
    }
upload-status-deleted = удалено: { $count }.
upload-status-duplicates = повторов выкинул: { $count }.
upload-status-continue = докидывай ещё или собираем.
viewer-empty = всё удалил. набор пустой.
viewer-caption =
    { $current } из { $total }
    { $width }×{ $height }

# Commit
commit-not-started = ты ещё не начал. вот подсказка -> /new.
commit-missing = эм, попробуй ещё раз через /new.
commit-not-collecting = поезд ушёл, давай заново через /new.
commit-empty = бро, нечего собирать. скинь хоть что-нибудь.
commit-ready =
    { $photoCount ->
        [one] Готово. Собрал из { $photoCount } картинки.
        [few] Готово. Собрал из { $photoCount } картинок.
        [many] Готово. Собрал из { $photoCount } картинок.
       *[other] Готово. Собрал из { $photoCount } картинки.
    }

    Открывай редактор:
    <code>{ $url }</code>

    Код для ручного ввода:
    <code>{ $editCode }</code>

# List
list-empty-first =
    готовых композиций пока нет.

    сначала закинь картинки через /new.
list-empty-page = пусто. это всё.
list-empty = готовых композиций пока нет.
list-title = твои композиции
list-preview = превью
list-composition-number = композиция #{ $number }
list-pictures =
    { $count ->
        [one] { $count } картинка
        [few] { $count } картинки
        [many] { $count } картинок
       *[other] { $count } картинки
    }
list-link = ссылка:
list-delete-question = удалить композицию #{ $number }?
list-delete-details = { $pictures } · { $date }
list-delete-warning = удалю картинки из хранилища и уберу композицию из списка.
list-open-number = открыть { $number }
list-line = [{ $number }] — { $pictures } · { $dimensions } · { $date }
list-not-found = композиция куда-то пропала.
relative-minutes =
    { $count ->
        [one] { $count } минуту назад
        [few] { $count } минуты назад
        [many] { $count } минут назад
       *[other] { $count } минуты назад
    }
relative-hours =
    { $count ->
        [one] { $count } час назад
        [few] { $count } часа назад
        [many] { $count } часов назад
       *[other] { $count } часа назад
    }
relative-yesterday = вчера

# Photo / status
photo-start-first = сначала нажми /new.
status-not-started = ничего не начато. нажми /new, чтобы начать.
status-empty-use-new = набор пустой. кинь картинки через /new.
status-empty = набор пустой.
status-pictures =
    { $count ->
        [one] в наборе { $count } картинка.
        [few] в наборе { $count } картинки.
        [many] в наборе { $count } картинок.
       *[other] в наборе { $count } картинки.
    }

# Sticker
sticker-reply = мой стикер круче, долбоёб.

# Whitelist
whitelist-invalid-user-id = брат, ты какой-то кривой user_id скинул.
whitelist-invalid-command = такой команды нет. команды: add <user_id>, rm <user_id>
whitelist-user-already-added = пользователь уже есть в вайтлисте.
whitelist-user-added = пользователь добавлен в вайтлист.
whitelist-user-not-found = такого пользователя нет в вайтлисте.
whitelist-user-removed = пользователь удалён из вайтлиста.
whitelist-empty = вайтлист пуст.
whitelist-title = вайтлист: { $count }
whitelist-access = доступ по вайтлисту -> @kovs713
