import { defineActions } from 'direct-vuex'
import { moduleActionContext } from '@/store'
import apis from '@/lib/apis'
import { me, meMitt } from './index'
import { ChannelId, UserId } from '@/types/entity-ids'
import { ChannelSubscribeLevel, Message } from '@traptitech/traq'
import { ActionContext } from 'vuex'
import { detectMentionOfMe } from '@/lib/markdown/detector'

export const meActionContext = (context: ActionContext<unknown, unknown>) =>
  moduleActionContext(context, me)

export const actions = defineActions({
  async fetchMe(context) {
    const { commit } = meActionContext(context)
    const { data } = await apis.getMe()
    commit.setDetail(data)
  },
  onUserUpdated(context, userId: UserId) {
    const { getters, dispatch } = meActionContext(context)
    if (getters.myId !== userId) return

    dispatch.fetchMe()
  },

  async fetchStampHistory(
    context,
    { force = false }: { force?: boolean } = {}
  ) {
    const { state, commit } = meActionContext(context)
    if (!force && state.stampHistoryFetched) return

    const { data } = await apis.getMyStampHistory()
    commit.setStampHistory(
      new Map(data.map(h => [h.stampId, new Date(h.datetime)]))
    )
  },

  async fetchUnreadChannels(
    context,
    { force = false }: { force?: boolean } = {}
  ) {
    const { state, commit } = meActionContext(context)
    if (!force && state.unreadChannelsMapFetched) return

    const { data } = await apis.getMyUnreadChannels()
    commit.setUnreadChannelsMap(
      new Map(
        data.map(unreadChannel => [unreadChannel.channelId, unreadChannel])
      )
    )
  },
  onChannelRead(context, channelId: ChannelId) {
    const { commit } = meActionContext(context)
    commit.deleteUnreadChannel(channelId)
  },
  onMessageCreated(context, message: Message) {
    const { rootState, getters, commit, rootGetters } = meActionContext(context)
    // 見ているチャンネルは未読に追加しない
    if (rootState.domain.messagesView.currentChannelId === message.channelId)
      return
    // 自分の投稿は未読に追加しない
    if (rootGetters.domain.me.myId === message.userId) return

    const noticeable =
      detectMentionOfMe(
        message.content,
        rootGetters.domain.me.myId ?? '',
        rootState.domain.me.detail?.groups ?? []
      ) || !!rootState.entities.channelsMap.get(message.channelId)?.force
    const isDM = rootState.entities.dmChannelsMap.has(message.channelId)
    const isChannelSubscribed = getters.isChannelSubscribed(message.channelId)
    if (!noticeable && !isDM && !isChannelSubscribed) return

    commit.upsertUnreadChannel({ message, noticeable })
  },

  async fetchStaredChannels(
    context,
    { force = false }: { force?: boolean } = {}
  ) {
    const { state, commit } = meActionContext(context)
    if (!force && state.staredChannelSetFetched) return

    const { data } = await apis.getMyStars()
    commit.setStaredChannels(new Set(data))
  },
  onAddStaredChannel(context, channelId: ChannelId) {
    const { commit } = meActionContext(context)
    commit.addStaredChannel(channelId)
  },
  onDeleteStaredChannel(context, channelId: ChannelId) {
    const { commit } = meActionContext(context)
    commit.deleteStaredChannel(channelId)
  },

  async fetchSubscriptions(
    context,
    { force = false }: { force?: boolean } = {}
  ) {
    const { state, commit } = meActionContext(context)
    if (!force && state.subscriptionMapFetched) return

    const res = await apis.getMyChannelSubscriptions()
    commit.setSubscriptionMap(
      new Map(res.data.map(s => [s.channelId, s.level]))
    )
    meMitt.emit('setSubscriptions')
  },
  async changeSubscriptionLevel(
    context,
    payload: { channelId: ChannelId; subscriptionLevel: ChannelSubscribeLevel }
  ) {
    const { commit } = meActionContext(context)
    apis.setChannelSubscribeLevel(payload.channelId, {
      level: payload.subscriptionLevel
    })
    commit.setSubscription(payload)
    meMitt.emit('updateSubscriptions')
  }
})
