# Commands
command-start = welcome message
command-new = start feeding pictures
command-reset = cancel the current upload
command-commit = build the current composition
command-status = check upload status
command-list = view finished compositions

# Shared
user-not-found = don't see anyone, can't start.
menu-new = new composition
menu-list = my compositions
menu-help = how it works
menu-placeholder = choose an action or send pictures
menu-ready = the main actions are now pinned below.
button-view = view
button-build = build
button-remove = remove
button-remove-latest = remove latest
button-remove-all = remove all
button-remove-all-confirm = yes, remove all
button-delete = delete
button-close = close
button-back = back
button-home = home
button-next = next
button-cancel = cancel
button-continue = continue
button-open-editor = open editor
button-yes-remove = yes, remove
button-no-cancel = no, cancel
button-cancel-upload = cancel upload
button-cancel-upload-confirm = yes, cancel
callback-removed = removed
callback-deleting = deleting...
callback-outdated = this panel is outdated
date-missing = w/o date
size-not-ready = size not ready yet

# Start / new / reset
start-message =
    i'll turn your pictures into one composition.

    1. tap “new composition”.
    2. send pictures in a batch or one at a time.
    3. review the pack and tap “build”.

    the main actions are always available in the menu below.
help-message =
    how to build a composition:

    1. tap “new composition”.
    2. send pictures as photos, without captions.
    3. tap “view” to review the pack and remove unwanted pictures.
    4. tap “build”, then open the editor.

    i'll skip duplicates. you can cancel the current upload below its status.
new-message =
    send some pictures.

    you can send them all at once, one at a time, or in any order.
    i'll figure it out.
new-already-active = you already have an active upload. build or cancel it first.
reset-done = reset. you can send pictures again.
reset-nothing = nothing to reset.

# Upload
upload-nothing-to-show = nothing to show yet.
upload-building =
    { $count ->
        [one] building from { $count } picture.
       *[other] building from { $count } pictures.
    }
upload-no-active-composition = there is no active composition. create a new one below.
upload-clear-question = remove every picture?
upload-cancel-question = cancel the current upload completely?
upload-cleared = everything has been removed. you can send new pictures.
upload-cleared-empty = everything has been removed. the pack is empty.
upload-status-empty =
    nothing to show yet.
    send some pictures first.
upload-status-pictures =
    { $count ->
        [one] { $count } picture in the pack.
       *[other] { $count } pictures in the pack.
    }
upload-status-deleted = deleted: { $count }.
upload-status-duplicates = duplicates removed: { $count }.
upload-status-continue = send more pictures or build.
group-photo-prompt = reply to this message with pictures for the shared pack.
group-photo-placeholder = attach pictures
viewer-empty = everything has been removed.
viewer-caption =
    { $current } of { $total }
    { $width }×{ $height }

# Commit
commit-not-started = create a new composition with the button below first.
commit-missing = couldn't find the current composition. create a new one below.
commit-not-collecting = this composition can no longer be changed. create a new one below.
commit-empty = nothing to build. send at least one picture.
commit-ready =
    { $photoCount ->
        [one] done. built from { $photoCount } picture.
       *[other] done. built from { $photoCount } pictures.
    }

    open the editor:
    <code>{ $url }</code>

    manual code:
    <code>{ $editCode }</code>

# List
list-empty-first =
    no ready compositions yet.

    create the first one with the button below.
list-empty-page = empty. that's all.
list-empty = no ready compositions yet.
list-title = your compositions
list-preview = preview
list-composition-number = composition #{ $number }
list-pictures =
    { $count ->
        [one] { $count } picture
       *[other] { $count } pictures
    }
list-link = link:
list-delete-question = remove composition #{ $number }?
list-delete-details = { $pictures } · { $date }
list-delete-warning = i'll delete its pictures from storage and remove it from the list.
list-open-number = open { $number }
list-line = [{ $number }] — { $pictures } · { $dimensions } · { $date }
list-not-found = composition has disappeared.
relative-minutes =
    { $count ->
        [one] { $count } min ago
       *[other] { $count } min ago
    }
relative-hours =
    { $count ->
        [one] { $count } h ago
       *[other] { $count } h ago
    }
relative-yesterday = yesterday

# Photo / status
photo-start-first = create a new composition with the button below first.
status-not-started = no upload is active. create a new composition below.
status-empty-use-new = the pack is empty. just send some pictures.
status-empty = the pack is empty.
status-pictures =
    { $count ->
        [one] { $count } picture in the pack.
       *[other] { $count } pictures in the pack.
    }

# Sticker
sticker-reply = my sticker is cooler, dumbass.

# Whitelist
whitelist-invalid-user-id = bro, that user_id is invalid.
whitelist-invalid-command = command invalid. commands: add <user_id>, rm <user_id>
whitelist-user-already-added = user is already in the whitelist.
whitelist-user-added = user has been added to the whitelist.
whitelist-user-not-found = this user is not in the whitelist.
whitelist-user-removed = user has been removed from the whitelist.
whitelist-empty = whitelist is empty.
whitelist-title = whitelist: { $count }
whitelist-access = whitelist access -> @kovs713
