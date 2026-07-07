# Telegram Upload UX — Decision Note

Работаем над Telegram UX для загрузки картинок в jigtable.

Нужен MVP-флоу без AI-slop, без эмодзи, без "панельного" языка. Тон: коротко, по-человечески, можно с лёгким угаром, но без клоунады.

Главная UX-модель:
- в чате максимум два сообщения от бота:
  1. status panel — нижнее агрегированное сообщение upload-сессии;
  2. viewer carousel — одно photo-message для просмотра и удаления картинок.
- бот не отвечает на каждую картинку;
- картинки воспринимаются как поток;
- статус обновляется через debounce;
- чтобы статус был "снизу", используем send new status -> delete old status;
- если delete старого статуса упал, игнорируем;
- если отправка нового статуса упала, старый статус остаётся.

Основной флоу:
1. /new
   - создать upload session;
   - отправить status panel.
2. Пользователь кидает картинки:
   - одиночные photo;
   - альбомы;
   - несколько альбомов подряд;
   - forwarded photo;
   - forwarded media group.
3. Бот:
   - молча принимает;
   - берёт самый большой PhotoSize через message.photo.at(-1);
   - сохраняет file_id, file_unique_id, width, height, file_size?, sourceMessageId, mediaGroupId?;
   - дедуплицирует;
   - обновляет status panel через debounce.
4. Кнопка "глянуть" открывает карусель:
   - одно photo-message;
   - caption вида:
     "7 из 40
      1080×1920"
   - кнопки:
     [назад] [удалить] [дальше]
     [закрыть] [собрать]
5. В карусели:
   - не удалил -> значит оставил;
   - отдельной кнопки "оставить" не нужно;
   - листание просто переключает active-картинку через editMessageMedia;
   - удаление ставит текущей картинке status = "deleted";
   - после удаления показывается следующая active-картинка;
   - если следующей нет, показывается предыдущая;
   - если active-картинок не осталось, viewer показывает "Всё удалил. Набор пустой."
6. Кнопка "собрать":
   - доступна и в status panel, и в viewer;
   - берёт только active images;
   - если viewer открыт, можно закрыть/удалить viewer;
   - status panel обновить в "Собираю из N картинок."
7. Кнопка "очистить/снести всё":
   - требует confirm:
     "Точно снести весь набор?"
     [да, снести] [не надо]

Кнопки status panel:
[глянуть] [собрать]
[убрать последнюю] [снести всё]

Стартовый текст:
"Кидай картинки.

Можно пачкой, можно по одной, можно как попало.
Я разберусь."

Статус после загрузки:
"В наборе 27 картинок.
2 дубля мимо кассы.

Докидывай ещё или собираем."

Или:
"В наборе 27 картинок.
Удалено: 3.
Повторов выкинул: 2.

Докидывай ещё или собираем."

Нет картинок:
"Смотреть пока нечего.
Кинь сначала картинки."

Слишком мало для сборки:
"Нужно хотя бы 2 картинки.
Из одной пазл так себе, конечно."

Удаление:
callback answer: "Удалил"

Очистка:
"Снёс. Можно кидать заново."

Ошибка сборки:
"Не собралось.

Похоже, одна из картинок приехала криво. Попробуй удалить подозрительную или начать заново."

Типы:

```typescript
type UploadedImage = {
  id: string;
  fileId: string;
  fileUniqueId: string;
  width: number;
  height: number;
  fileSize?: number;
  sourceMessageId: number;
  mediaGroupId?: string;
  status: "active" | "deleted";
  createdAt: number;
};

type UploadSession = {
  images: UploadedImage[];
  duplicateCount: number;
  // для дедупа, в памяти Set, в persisted state массив
  seenFileUniqueIds: Set<string> | string[];
  statusMessageId?: number;
  statusRefreshTimer?: Timer;
  lastStatusRefreshAt?: number;
  viewerMessageId?: number;
  viewerImageId?: string;
};
```

Derived state:
- activeImages = images.filter(img => img.status === "active")
- deletedImages = images.filter(img => img.status === "deleted")

Дедупликация:
- для MVP использовать Telegram file_unique_id;
- не сравнивать width/height/area как основной критерий;
- не скачивать файл для побайтового SHA-256 в MVP;
- не делать perceptual hash в MVP;
- повторная отправка уже удалённой картинки в той же upload-сессии считается дублем.
- seenFileUniqueIds не чистить при удалении.

Почему file_unique_id:
- Telegram уже даёт стабильный идентификатор файла;
- file_id нужен для скачивания/отправки;
- file_unique_id нельзя использовать для скачивания, зато идеально подходит для дедупа внутри сессии;
- если это один и тот же Telegram-файл, не надо скачивать байты.

Callback handlers:
- upload:view
- upload:build
- upload:delete_last
- upload:clear
- upload:clear_confirm
- upload:clear_cancel
- viewer:next
- viewer:prev
- viewer:delete
- viewer:back
- viewer:build
- viewer:noop

Функции:
- getActiveImages(session)
- getDeletedImages(session)
- getCurrentViewerIndex(session)
- getViewerImage(session)
- selectNextViewerImage(session)
- selectPrevViewerImage(session)
- deleteCurrentViewerImage(session)
- renderUploadStatus(session)
- renderUploadKeyboard(session)
- openViewer(ctx)
- refreshViewer(ctx)
- renderViewerCaption(session)
- renderViewerKeyboard(session)
- refreshBottomStatus(ctx)
- scheduleUploadStatusRefresh(ctx)

Технические решения:
- status panel обновлять через debounce ~1000–1500ms после последней картинки;
- дополнительно throttle, чтобы не делать delete/send чаще чем раз в 2–3 секунды при активном потоке;
- viewer обновлять через editMessageMedia;
- если editMessageMedia упал, fallback: отправить новый viewer и сохранить новый viewerMessageId;
- если старый viewer/status не удалился, не валить сессию;
- callback-и должны использовать текущее session state, а не доверять старым индексам;
- viewerImageId хранить как stable image.id, а индекс вычислять среди activeImages;
- на первой картинке кнопка назад становится noop "·";
- на последней картинке кнопка дальше становится noop "·";
- зацикливание карусели не нужно для MVP.

Project decisions:
1. Telegram upload UX = status panel + image carousel.
2. Всё, что пользователь не удалил, считается оставленным.
3. Никакой approve/keep кнопки.
4. Дедуп в MVP только по file_unique_id.
5. Тон сообщений: без эмодзи, коротко, человечески, слегка с угаром.
6. Не превращать Telegram в полноценную галерею. Настоящее редактирование останется в вебе.
