# Commands
command-start = приветственное сообщение
command-new = начать загружать картинки
command-reset = отменить текущую загрузку
command-commit = собрать текущую композицию
command-status = проверить статус загрузки
command-list = посмотреть готовые композиции

# Shared
user-not-found = не вижу пользователя, не могу начать.
menu-new = новая композиция
menu-list = мои композиции
menu-help = как это работает
menu-placeholder = выбери действие или отправь картинки
menu-ready = основные действия закрепил в меню снизу.
button-view = глянуть
button-build = собрать
button-remove = удалить
button-remove-latest = убрать последнюю
button-remove-all = снести всё
button-remove-all-confirm = да, снести всё
button-delete = удалить
button-close = закрыть
button-back = назад
button-home = главная
button-next = дальше
button-cancel = не надо
button-continue = дальше
button-open-editor = открыть редактор
button-yes-remove = да, удалить
button-no-cancel = нет, не надо
button-cancel-upload = отменить загрузку
button-cancel-upload-confirm = да, отменить
callback-removed = удалил
callback-deleting = удаляю...
callback-outdated = эта панель уже неактуальна
date-missing = без даты
size-not-ready = размер ещё не готов

# Start / new / reset
start-message =
    соберу из твоих картинок одну композицию.

    1. нажми «новая композиция».
    2. пришли картинки — пачкой или по одной.
    3. проверь набор и нажми «собрать».

    основные действия всегда доступны в меню снизу.
help-message =
    как собрать композицию:

    1. нажми «новая композиция».
    2. отправь картинки без файлов и подписей.
    3. кнопка «глянуть» откроет набор, там можно удалить лишнее.
    4. нажми «собрать», затем открой редактор.

    повторные картинки я пропущу. текущую загрузку можно отменить под её статусом.
new-message =
    кидай картинки.

    можно пачкой, можно по одной, можно как попало.
    я разберусь.
new-already-active = у тебя уже есть текущая загрузка. сначала собери или отмени её.
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
upload-no-active-composition = нет активной композиции. создай новую кнопкой снизу.
upload-clear-question = точно снести весь набор?
upload-cancel-question = отменить текущую загрузку целиком?
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
commit-not-started = сначала создай новую композицию кнопкой снизу.
commit-missing = не нашёл текущую композицию. создай новую кнопкой снизу.
commit-not-collecting = эту композицию уже нельзя изменить. создай новую кнопкой снизу.
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

    создай первую кнопкой ниже.
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
photo-start-first = сначала создай новую композицию кнопкой снизу.
status-not-started = сейчас ничего не загружается. создай новую композицию кнопкой снизу.
status-empty-use-new = набор пустой. просто пришли картинки.
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
