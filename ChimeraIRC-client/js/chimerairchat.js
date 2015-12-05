var chimeraIRChat = function (ip_port) {
  this.connectTo = ip_port
  this.isChatVisible = true
  this.messageHistoryLimit = 16
  this.newMessageAudioMuted = false
  this.hasHistoryLoaded = false
  this.reconnected = false
  this.userWasConnected = false
  this.allowUserColor = true
  this.showEmoticons = true
  this.autoReconnect = true
  this.user = ''
  this.newMessageAudioFile = new Audio('ChimeraIRC-client/audio/new_message.mp3')
  this.emoticonList = {}
  this.lastHistoryDateGot = ''

  this.chatStatus = $('#cChatStatus')
  this.chatWrapper = $('#cChatWrapper')
  this.chatContainer = $('#cChatContainer')
  this.chatMessages = $('#cChatMessages')
  this.chatMessageSection = $('#cChatMessageSection')
  this.chatMessageRow = this.chatMessages.find('.cCmessageRow:first')
  this.chatHistoryLinkRow = $('#cChatLoadOlderHistory')

  this.init()
}

chimeraIRChat.prototype.init = function () {
  var self = this

  // Check from cache and use that instead of the default value if it exists
  if (localStorage['cChatMessageHistoryLimit'] === undefined) {
    localStorage['cChatMessageHistoryLimit'] = this.messageHistoryLimit
  } else {
    this.messageHistoryLimit = localStorage['cChatMessageHistoryLimit']
    $('#cChatHistoryLimitInput').val(this.messageHistoryLimit)
  }
  // Similar check
  if (localStorage['cChatVisible'] === undefined) {
    localStorage['cChatVisible'] = this.isChatVisible
  } else {
    this.isChatVisible = localStorage['cChatVisible']
    // Hide the chat if the value is false
    if (this.isChatVisible === 'true') {
    } else {
      self.chatContainer.css('height', '0').hide()
      self.chatWrapper.css('height', '23px')
      $('#cChatToggleDown').show()
    }
  }
  // Similar check
  if (localStorage['cChatSoundMuted'] === undefined) {
    localStorage['cChatSoundMuted'] = this.newMessageAudioMuted
  } else {
    this.newMessageAudioMuted = (localStorage['cChatSoundMuted'] === 'true')
    $('#cChatMessageSoundCheckbox').prop('checked', !this.newMessageAudioMuted)
  }
  // Similar check
  if (localStorage['cChatShowEmoticons'] === undefined) {
    localStorage['cChatShowEmoticons'] = this.showEmoticons
  } else {
    this.showEmoticons = (localStorage['cChatShowEmoticons'] === 'true')
    $('#cChatShowEmoticonsCheckbox').prop('checked', this.showEmoticons)
  }
  // Similar check
  if (localStorage['cChatAutoReconnect'] === undefined) {
    localStorage['cChatAutoReconnect'] = this.autoReconnect
  } else {
    this.autoReconnect = (localStorage['cChatAutoReconnect'] === 'true')
    $('#cChatAutoReconnectSetting').prop('checked', this.autoReconnect)
  }

  // Todo : func to do the above checks

  /*
      TASKBAR
  */
  $('#cChatToggleEmoticons').on('click', function () {
    // Do nothing if the chat is hidden
    if (!self.isChatVisible) {
      return
    }

    var chatEmoticonContainer = $('#cChatEmoticons')
    var isVisible = chatEmoticonContainer.is(':visible')

    if (isVisible) {
      chatEmoticonContainer.hide()
    } else {
      $('.cChatPopUpContent:visible').hide()
      chatEmoticonContainer.show()
    }
  })

  $('#cChatToggleSettings').on('click', function () {
    // Do nothing if the chat is hidden
    if (!self.isChatVisible) {
      return
    }

    var chatSettingContainer = $('#cChatSettings')
    var isVisible = chatSettingContainer.is(':visible')

    if (isVisible) {
      chatSettingContainer.hide()
    } else {
      $('.cChatPopUpContent:visible').hide()
      chatSettingContainer.show()
    }
  })

  $('.cChatToggle').on('click', function () {
    var isVisible = self.chatContainer.is(':visible')

    if (isVisible) {
      self.chatContainer.css('height', '0').hide()
      self.chatWrapper.css('height', '23px')
      $('#cChatToggleDown').show()
      self.isChatVisible = false
      localStorage['cChatVisible'] = false
    } else {
      self.chatContainer.show().css('height', '200px')
      self.chatWrapper.css('height', '100%')
      $('#cChatToggleDown').hide()
      self.isChatVisible = true
      localStorage['cChatVisible'] = true
    }
  })

  /*
      SETTINGS
  */
  $('#cChatHistoryLimitInput').focusout(function () {
    var newLimit = $(this).val()

    // Do nothing if the value didn't actually change
    if (newLimit === self.messageHistoryLimit) {
      return
    }

    // Limit the chat history to 120
    if (newLimit > 120) {
      newLimit = 120
    }

    self.messageHistoryLimit = newLimit
    localStorage['cChatMessageHistoryLimit'] = newLimit

    $('#cChatMessageHistorySettingConfirmation').fadeIn('normal').fadeOut('3000')
  })

  $('#cChatMessageSoundCheckbox').on('click', function () {
    var muteAudioCheckbox = $('#cChatMessageSoundCheckbox')
    var isMuted = muteAudioCheckbox.prop('checked') === false

    self.newMessageAudioMuted = isMuted
    localStorage['cChatSoundMuted'] = isMuted
  })

  $('#cChatShowEmoticonsCheckbox').on('click', function () {
    var showEmoticonsCheckbox = $('#cChatShowEmoticonsCheckbox'),
      emoticonSetting = showEmoticonsCheckbox.prop('checked')

    self.showEmoticons = emoticonSetting
    localStorage['cChatShowEmoticons'] = emoticonSetting
  })

  $('#cChatAutoReconnectSetting').on('click', function () {
    var autoReconnectSetting = $('#cChatAutoReconnectSetting')
    var autoReconnect = autoReconnectSetting.prop('checked')

    self.autoReconnect = autoReconnect
    localStorage['cChatAutoReconnect'] = autoReconnect
  })

  /*
      CHAT
  */
  $('#cChatLoadOlderHistory').on('click', function () {
    this.chatHistoryLinkRow = $(this).parent().parent()
    $(this).children().show()

    self.primus.write({
      'type': 'getHistory'
    })
  })
}

chimeraIRChat.prototype.blankConnect = function () {
  this.connect(this.connectTo + '?type=blank&key=')
}

chimeraIRChat.prototype.SMFconnect = function (key, username) {
  this.connect(this.connectTo + '?type=smf&key=' + key + '&user=' + username)
}

chimeraIRChat.prototype.connect = function (url) {
  var self = this

  this.primus = Primus.connect(url + '&historyLimit=' + this.messageHistoryLimit, { strategy: 'online, disconnect' })
  // console.log(this.primus, " this.primus set!")

  this.primus.on('open', function () {
    self.chatStatus.children(':first').css('background-color', 'green').next().html('Connected')
  })

  this.primus.on('close', function () {})

  this.primus.on('data', function (data) {
    // console.log("Data received!")

    if (data.type == null) {
      return
    }

    switch (data.type) {
      case 'History':
        self.loadHistory(data, self.handleOutgoingMessages)
        break
      default:
        // console.log("default selected")
        self.handleIncomingMessages(data)
    }
  })

  this.primus.on('reconnect', function () {
    self.primus.end()
  // self.reconnected = true
  // console.log(self.reconnected, " reconnected?")
  })

  this.primus.on('end', function () {
    self.chatStatus.children(':first').css('background-color', 'red').next().html('Disconnected')
  })
}

chimeraIRChat.prototype.loadHistory = function (data, callback) {
  // console.log("loadHistory() loaded!", data, this.reconnected)
  // console.log("lastly: " + this.lastHistoryDateGot, "date: " + data.date)
  // console.log("Messages length", data.messages.length, "history limit", this.messageHistoryLimit)

  if (this.reconnected) {
    this.reconnected = false
    return
  }

  this.user = data.user

  var updateHistory = false

  if (data.messages != null) {
    if (this.lastHistoryDateGot === data.date) {
      updateHistory = true
      data.messages = data.messages.reverse()
    }

    for (var i = 0; i < data.messages.length; i++) {
      this.buildMessage(JSON.parse(data.messages[i]), updateHistory, data.more)
    }

    if (!this.hasHistoryLoaded) {
      this.chatMessages.scrollTop(this.chatMessages[0].scrollHeight)
    }
  }

  if (!this.hasHistoryLoaded) {
    callback.call(this)
  }

  this.hasHistoryLoaded = true
  this.lastHistoryDateGot = data.date
}

chimeraIRChat.prototype.handleOutgoingMessages = function () {
  var self = this

  // console.log("handleOutgoingMessages() loaded!")

  $('#cChatForm').submit(function (event) {
    event.preventDefault()

    $('#cChatEmoticons').hide()

    var input = $(this).find('#cChatMessageInput')
    var msg = input.val()

    self.primus.write({
      'type': 'newMessage',
      'message': msg
    })

    // console.log("New message send!")

    input.val('')

    return false
  })
}

chimeraIRChat.prototype.handleIncomingMessages = function (data) {
  // console.log("handleIncomingMessages()", this.user, data.user)

  this.handleSounds()
  this.buildMessage(data)

  if (!this.newMessageAudioMuted && this.user !== data.user) {
    this.newMessageAudioFile.play()
  }

  var scroll = (this.chatMessages[0].scrollHeight - this.chatMessages[0].scrollTop - this.chatMessages.height() <= 52)
  if (scroll) {
    this.chatMessages.scrollTop(this.chatMessages[0].scrollHeight)
  }
}

chimeraIRChat.prototype.buildMessage = function (data, updateHistory, more) {
  // console.log("buildMessage()", data, updateHistory)

  if ($('.cChatSection[data-date="' + data.date + '"]').length === 0) {
    var messageSection = this.chatMessageSection.clone()
    var historyLink = $('#cChatHistoryLinkSection').detach()

    messageSection.attr('data-date', data.date)
    messageSection.attr('id', '')
    messageSection.show()

    // History message section = top
    // Today message section = bottom
    if (data.date === getDate()) {
      this.chatMessages.append(messageSection).prepend(historyLink)
    } else {
      this.chatMessages.prepend(messageSection).prepend(historyLink)
    }
  } else {
    messageSection = $('.cChatSection[data-date="' + data.date + '"]')
  }

  messageSection.children('.cChatMessageDate').text(data.date)

  if (more > 0) {
    messageSection.children('.cChatMoreHistoryAvailable').show()
  } else {
    messageSection.children('.cChatMoreHistoryAvailable').hide()
  }

  var messageRow = this.chatMessageRow.clone()

  messageRow.find('.cCmessageTime').text('[' + data.time + ']')

  if (this.allowUserColor && data.color !== undefined) {
    messageRow.find('.cCmessageUser').css('color', data.color)
  }

  if (data.type === 'CleanMessageIRC') {
    messageRow.find('.cCmessageUser').html('<i></i>').children().text(data.user + ':')
  } else {
    messageRow.find('.cCmessageUser').text(data.user + ':')
  }

  messageRow.find('.cCmessage').html(linkfyi(this.handleEmoticons(data.message)))

  if (updateHistory) {
    messageRow.insertAfter(messageSection.children('.cChatMoreHistoryAvailable'))
  } else {
    messageSection.append(messageRow)
  }
}

chimeraIRChat.prototype.handleSounds = function () {
  this.newMessageAudioFile.muted = this.newMessageAudioMuted
}

chimeraIRChat.prototype.handleEmoticons = function (message) {
  if (this.showEmoticons && this.emoticonList !== undefined) {
    for (var i = 0; i < this.emoticonList.emoticons.length; i++) {
      message = message.replace(new RegExp(this.emoticonList.emoticons[i].code, 'g'), '<img src="ChimeraIRC-client/images/smileys/' + this.emoticonList.emoticons[i].file + '" />')
    }
  }

  return message
}

chimeraIRChat.prototype.addEmoticonsToContainer = function () {
  for (var i = 0; i < this.emoticonList.emoticons.length; i++) {
    var eCode = this.emoticonList.emoticons[i].code
    var eFile = this.emoticonList.emoticons[i].file
    $('#cChatEmoticons').children('div').append('<img src="ChimeraIRC-client/images/smileys/' + eFile + '" onclick="insertAtCaret(' + "'" + 'cChatMessageInput' + "'" + ',' + "'" + eCode + "'" + ');return false;" title="' + eCode + '" alt="' + eCode + '" name="' + eCode + '" />')
  }
}

chimeraIRChat.prototype.loadEmoticons = function () {
  var self = this

  $.getJSON('ChimeraIRC-client/scripts/emoticons.php')
    .done(function (json) {
      self.emoticonList = json
      self.addEmoticonsToContainer()
      return true
    })
    .fail(function (json) {
      // console.log("Could not load the emoticon list, does the file exist?")
      return false
    })
}

/*
    http://stackoverflow.com/a/1064139
*/
function insertAtCaret (areaId, text) {
  var txtarea = document.getElementById(areaId)
  var scrollPos = txtarea.scrollTop
  var strPos = 0
  var range = null
  var br = ((txtarea.selectionStart || txtarea.selectionStart === '0') ? 'ff' : (document.selection ? 'ie' : false))
  if (br === 'ie') {
    txtarea.focus()
    range = document.selection.createRange()
    range.moveStart('character', -txtarea.value.length)
    strPos = range.text.length
  }
  else if (br === 'ff') strPos = txtarea.selectionStart

  var front = (txtarea.value).substring(0, strPos)
  var back = (txtarea.value).substring(strPos, txtarea.value.length)
  txtarea.value = front + text + back
  strPos = strPos + text.length
  if (br === 'ie') {
    txtarea.focus()
    range = document.selection.createRange()
    range.moveStart('character', -txtarea.value.length)
    range.moveStart('character', strPos)
    range.moveEnd('character', 0)
    range.select()
  } else if (br === 'ff') {
    txtarea.selectionStart = strPos
    txtarea.selectionEnd = strPos
    txtarea.focus()
  }
  txtarea.scrollTop = scrollPos
}

function linkfyi (message) {
  var replacedText, replacePattern1, replacePattern2, replacePattern3

  // URLs starting with http://, https://, or ftp://
  replacePattern1 = /(\b(https?|ftp):\/\/[-A-Z0-9+&@#\/%?=~_|!:;,.]*[-A-Z0-9+&@#\/%=~_|])/gim
  replacedText = message.replace(replacePattern1, '<a href="$1" target="_blank">$1</a>')

  // URLs starting with "www." (without // before it, or it'd re-link the ones done above).
  // Anti XSS
  replacePattern2 = /(^|[^\/])(www\.[^\s"]+(\b|$))/gim
  replacedText = replacedText.replace(replacePattern2, '$1<a href="http://$2" target="_blank">$2</a>')

  // Change email addresses to mailto:: links.
  replacePattern3 = /(\w+@[a-zA-Z_]+?\.[a-zA-Z]{2,6})/gim
  replacedText = replacedText.replace(replacePattern3, '<a href="mailto:$1">$1</a>')

  return replacedText
}

function getDate () {
  var date = new Date(Date.now())
  var day = date.getDate()
  var month = date.getMonth() + 1
  var year = date.getFullYear()

  return day + '.' + month + '.' + year
}
