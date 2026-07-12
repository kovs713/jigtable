# Commands
command-start = welcome message
command-new = start feeding pictures
command-reset = cancel the current upload
command-commit = build the current composition
command-status = check upload status
command-list = view finished compositions

# Shared
user-not-found = don't see anyone, can't start.
button-view = view
button-build = build
button-remove = remove
button-remove-latest = remove latest
button-remove-all = remove all
button-remove-all-confirm = yes, remove all
button-delete = delete
button-close = close
button-back = back
button-next = next
button-cancel = cancel
button-continue = continue
button-open-editor = open editor
button-yes-remove = yes, remove
button-no-cancel = no, cancel
callback-removed = removed
callback-deleting = deleting...
date-missing = w/o date
size-not-ready = size not ready yet

# Start / new / reset
start-message =
    put some pictures.

    you can put them all at once, one at a time, or however you like.
    i'll figure it out.
new-message =
    send some pictures.

    you can send them all at once, one at a time, or in any order.
    i'll figure it out.
reset-done = reset. you can send pictures again.
reset-nothing = nothing to reset.

# Upload
upload-nothing-to-show = nothing to show yet.
upload-building =
    { $count ->
        [one] building from { $count } picture.
       *[other] building from { $count } pictures.
    }
upload-no-active-composition = there is no active composition. start with /new.
upload-clear-question = remove every picture?
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
viewer-empty = everything has been removed.
viewer-caption =
    { $current } of { $total }
    { $width }×{ $height }

# Commit
commit-not-started = you haven't started yet. use /new.
commit-missing = hmm, try again with /new.
commit-not-collecting = this composition is no longer collecting pictures. start again with /new.
commit-empty = nothing to build. send at least one picture.
commit-ready =
    { $photoCount ->
        [one] Done. Built from { $photoCount } picture.
       *[other] Done. Built from { $photoCount } pictures.
    }

    Open the editor:
    <code>{ $url }</code>

    Manual code:
    <code>{ $editCode }</code>

# List
list-empty-first =
    no ready compositions yet.

    first send some pictures with /new.
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
photo-start-first = first start with /new.
status-not-started = nothing has been started yet. use /new.
status-empty-use-new = the pack is empty. send some pictures with /new.
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
